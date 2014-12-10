var async = require('async')
  , redis = require('redis-url').connect(process.env.REDISCLOUD_URL)
  , loadedBackupSummaries = false;

var mongoose;
var reducerSummaries = {};

exports.backupSummaries = function() {
	redis.set('summaries', JSON.stringify(reducerSummaries));
}

var loadBackupSummaries = function(callback) {
	if (!loadedBackupSummaries) {
		redis.get('summaries', function(err, value) {
			if (!err && value != null) {
				reducerSummaries = JSON.parse(value);
			}
			loadedBackupSummaries = true;
			callback();
		});
	} else {
		callback();
	}
}

var genericMapReduce = function(scope, tracker, startDate){
	scope.query = scope.query || { tracker: tracker.name, date: { $gte: startDate } }
	scope.map = scope.map || function(){}
	scope.reduce = scope.reduce || function(date, vals) {
		var reduced = {count: 0, last: 0};
		for (var i = 0; i < vals.length; i++) {
			reduced.count += vals[i].count;
			reduced.last += vals[i].last;
		}
		return reduced;
	}
	scope.finalize = scope.finalize || function(key, val) {
		return {id: key, value: (val.last / val.count)}
	}
	return scope;
}

var getOptimalStartDate = function(tracker, methodName, startDate) {
	var trackerData = reducerSummaries[tracker.name] || false;
	if (!trackerData) {
		return new Date(startDate);
	}
	var methodData = reducerSummaries[tracker.name][methodName] || false;
	if (!methodData) {
		return new Date(startDate);
	}
	if (methodData.length < 1) {
		return new Date(startDate);
	}
	return new Date(methodData[methodData.length-1][0]);
}

var updateOptimal = function(tracker, method, results) {
	console.log('Update results for', tracker.name, method.name);

	if (!results || results.length < 1) {
		return;
	}

	var methodData = reducerSummaries[tracker.name][method.name] || false;
	if (!methodData) {
		reducerSummaries[tracker.name][method.name] = [];
		for (var i = 0; i < results.length; i++) {
			reducerSummaries[tracker.name][method.name].push([results[i].id, results[i].value]);
		}
	} else {
		var startDate = results[0].id;
		var startIndex = 0;
		for (var i = 0; i < methodData.length; i++) {
			if (methodData[i][0] == startDate) {
				startIndex = i;
				break;
			}
		}
		for (var i = 0; i < results.length; i++) {
			reducerSummaries[tracker.name][method.name][startIndex + i] = [results[i].id, results[i].value];
		}
	}

	// Reduce summaries to only include appropriate time data
	while (reducerSummaries[tracker.name][method.name][0][0] < method.minDate()) {
		reducerSummaries[tracker.name][method.name].shift();
	}

	exports.backupSummaries();
}

var yearMapReduce = function(tracker) {
	// Last Year
	var startDate = new Date(Date.now());
	startDate.setFullYear(startDate.getFullYear() - 1);
	startDate.setHours(0, 0, 0, 0);
	return genericMapReduce({
		map: function() {
			// One key per day
			this.date.setHours(0,0,0,0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'year', startDate));
}

var monthMapReduce = function(tracker) {
	// Last month
	var startDate = new Date(Date.now());
	startDate.setMonth(startDate.getMonth() - 1);
	startDate.setHours(0, 0, 0, 0);

	return genericMapReduce({
		map: function() {
			// 12 keys per day (divide days into 12 periods)
			var hour = this.date.getHours();
			hour = hour - (hour % 2);
			this.date.setHours(hour, 0, 0, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'month', startDate));
}

var weekMapReduce = function(tracker) {
	// Last week
	var startDate = new Date(Date.now());
	startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 7);
	startDate.setHours(0, 0, 0, 0);

	return genericMapReduce({
		map: function() {
			// 48 keys per day (divide days into 48 periods)
			var hour = this.date.getHours();
			var minute = this.date.getMinutes();
			minute = minute - (minute % 30);
			this.date.setHours(hour, minute, 0, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'week', startDate));
}


var dayMapReduce = function(tracker) {
	// Last day
	var startDate = new Date(Date.now());
	startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 1);

	return genericMapReduce({
		map: function() {
			// 15 keys per hour
			var hour = this.date.getHours();
			var minute = this.date.getMinutes();
			minute = minute - (minute % 4);
			this.date.setHours(hour, minute, 0, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'day', startDate));
}


var h12MapReduce = function(tracker) {
	// Last 12 hours
	var startDate = new Date(Date.now());
	startDate.setHours(startDate.getHours() - 12);

	return genericMapReduce({
		map: function() {
			// 30 keys per hour
			var hour = this.date.getHours();
			var minute = this.date.getMinutes();
			minute = minute - (minute % 2);
			this.date.setHours(hour, minute, 0, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'h12', startDate));
}


var h3MapReduce = function(tracker) {
	// Last 3 hours
	var startDate = new Date(Date.now());
	startDate.setHours(startDate.getHours() - 3);

	return genericMapReduce({
		map: function() {
			// 120 keys per hour
			var hour = this.date.getHours();
			var minute = this.date.getMinutes();
			var second = this.date.getSeconds();
			second = second - (second % 30);
			this.date.setHours(hour, minute, second, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'h3', startDate));
}

var h1MapReduce = function(tracker) {
	// Last 1 hours
	var startDate = new Date(Date.now());
	startDate.setHours(startDate.getHours() - 1);

	return genericMapReduce({
		map: function() {
			// 360 keys per hour (6 per minute)
			var hour = this.date.getHours();
			var minute = this.date.getMinutes();
			var second = this.date.getSeconds();
			second = second - (second % 10);
			this.date.setHours(hour, minute, second, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}
			emit(key, value);
		}
	}, tracker, getOptimalStartDate(tracker, 'h1', startDate));
}

var cleanupReduce = function(tracker) {
	// Last Year
	var startDate = new Date(Date.now());
	// startDate.setFullYear(startDate.getFullYear() - 1);
	startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 30);

	var endDate = new Date(Date.now());
	endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 14);

	return genericMapReduce({
		query: { tracker: tracker.name, date: { $gte: startDate, $lt: endDate } },
		map: function() {
			// key every five minutes
			var hour = this.date.getHours();
			var minute = this.date.getMinutes();
			minute = minute - (minute % 5);
			this.date.setHours(hour, minute, 0, 0);
			var key  = this.date.valueOf();

			var value = {
				count: 1,
				last: this.last
			}

			emit(key, value);
		},
		reduce: function(date, vals) {
			var reduced = {count: 0, last: 0};
			for (var i = 0; i < vals.length; i++) {
				reduced.count += vals[i].count;
				reduced.last += vals[i].last;
			}
			return reduced;
		},
		finalize: function(key, val) {
			return {id: key, value: (val.last / val.count), count: val.count}
		}
	}, tracker);
}

exports.cleanup = function(tracker, callback) {
	var Tracker = mongoose.model('Tracker');

	console.log('running cleanup mapreduce', cleanupReduce(tracker));
	Tracker.mapReduce(cleanupReduce(tracker), function(err, results) {
		if (err) {
			console.log('error:', err);
			callback();
			return;
		}
		async.mapSeries(results,
			function(result, callback) {
				if (result.value.count < 2) {
					console.log('No records to remove for', tracker.name);
					callback();
					return;
				}

				console.log('Found records to remove for', tracker.name);

				var startDate = result.value.id;
				var endDate = startDate + 300000; // 5min
				var midDate = startDate + 150000; // 2.5min
				var lastVal = result.value.value;

				Tracker.find({ tracker: tracker.name, date: { '$gte': startDate, '$lt': endDate } }).remove(function(err) {
					if (err) {
						console.log('Error deleting logs:', tracker.name, midDate, err);
						callback();
						return;
					}
					console.log('Saving summary for:', tracker.name, midDate);
					var log = new Tracker({ tracker: tracker.name, date: midDate, last: lastVal });
					log.save(function(err){
						if (err) {
							console.log('Error saving summary:', tracker.name, midDate, err);
						} else {
							console.log('Saved summary for:', tracker.name, midDate);
						}
						callback();
					});
				});
			},
			function() {
				callback();
			}
		);
	});
}

exports.generateSummaries = function(tracker, callback) {
	var Tracker = mongoose.model('Tracker');
	loadBackupSummaries(function(){
		reducerSummaries[tracker.name] = reducerSummaries[tracker.name] || {};
		async.mapSeries(methods,
			function(method, callback) {
				console.log('Running reduce for:' + tracker.name + ' ' + method.name);
				Tracker.mapReduce(method.fn(tracker), function(err, results) {
					if (err) {
						console.log('Error with mapReduce:', err);
						return
					}
					finalResults = [];
					for (var i = 0; i < results.length; i++) {
						finalResults.push({id: results[i].value.id, value: results[i].value.value});
					}
					updateOptimal(tracker, method, finalResults);
					callback();
				});
			},
			function() {
				callback();
			}
		);
	});
}

exports.setMongoose = function(mongooseIn) {
	mongoose = mongooseIn;
}

exports.getSummaries = function(tracker, callback) {
	async.mapSeries([tracker],
		function(tracker, callback) {
			// Already saved
			if (typeof reducerSummaries[tracker.name] != 'undefined') {
				callback();
			// Need to generate
			} else {
				exports.generateSummaries(tracker, function(err, results) {
					callback();
				});
			}
		},
		function(){
			callback(reducerSummaries);
		}
	);
}

var methods = [
	{ name: 'year', fn: yearMapReduce, minDate: function() { return new Date().setFullYear(new Date().getFullYear() - 1) } },
	{ name: 'month', fn: monthMapReduce, minDate: function() { return new Date().setMonth(new Date().getMonth() - 1) } },
	{ name: 'week', fn: weekMapReduce, minDate: function() { return new Date().valueOf() - 604800000 } },
	{ name: 'day', fn: dayMapReduce,  minDate: function() { return new Date().valueOf() - 86400000 } },
	{ name: 'h12', fn: h12MapReduce, minDate: function() { return new Date().valueOf() - 43200000 } },
	{ name: 'h3', fn: h3MapReduce,  minDate: function() { return new Date().valueOf() - 10800000 } },
	{ name: 'h1', fn: h1MapReduce, minDate: function() { return new Date().valueOf() - 3600000 } },
];
