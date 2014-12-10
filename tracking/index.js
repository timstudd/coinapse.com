var https = require('https')
  , async = require('async')
  , cronJob = require('cron').CronJob
  , reduce = require('./reduce.js')
  , redis = require('redis-url').connect(process.env.REDISCLOUD_URL)
  , loadedBackupM10 = false;

var trackers = [
	// { title: 'BTC-e', name: 'btce', url: 'https://btc-e.com/api/2/btc_usd/ticker' },
	// { title: 'Bitstamp', name: 'bitstamp', url: 'https://www.bitstamp.net/api/ticker/' },
	{ title: 'Bitfinex', name: 'bitfinex', url: 'https://api.bitfinex.com/v1/ticker/btcusd' },
];

var m10 = {}

var updateM10 = function(tracker, result) {
	m10[tracker.name] = m10[tracker.name] || [];
	m10[tracker.name].push(result);
	while (m10[tracker.name].length > 300) {
		m10[tracker.name].shift();
	}
	redis.set('m10', JSON.stringify(m10));
}

var getM10 = function(trackerName) {
	return m10[trackerName] || [];
}

var loadBackupM10 = function(callback) {
	if (!loadedBackupM10) {
		redis.get('m10', function(err, value) {
			if (!err && value != null) {
				m10 = JSON.parse(value);
			}
			loadedBackupM10 = true;
			callback();
		});
	} else {
		callback();
	}
}

exports.track = function(mongoose, io) {
	var Tracker = mongoose.model('Tracker');
	trackers.map(function(tracker) {
		tracker.log = new Tracker({ tracker: tracker.name });
		https.get(tracker.url, function(res) {
			var chunks = [];
			res.on('data', function(chunk) {
				chunks.push(chunk);
			}).on('end', function() {
				var body = Buffer.concat(chunks);
				var json = JSON.parse(body);
				json.ticker = json.ticker || {};
				tracker.log.last = json.last || json.last_price || json.ticker.last || null;

				tracker.log.save(function (err) {
					if (err) {
						console.log('Error creating instance', err);
					}
					console.log('Saved new instance');
				});

				// Store results into m10
				var result = [tracker.log.date.valueOf(), tracker.log.last];
				updateM10(tracker, result);
			});
		}).on('error', function(e) {
			console.log('Error performing request to:', tracker.url, e);
		});
	});
	exports.summary(mongoose, null, null, function(results){
		io.sockets.json.emit('update', results);
	});
}

exports.summary = function(mongoose, req, res, callback) {
	var res = res || false
		, callback = callback || false;

	loadBackupM10(function(){
		async.map(trackers,
			function(tracker, callback) {
				reduce.setMongoose(mongoose)
				reduce.getSummaries(tracker, function(results){
					callback(results);
				});
			},
			function(results) {
				for (key in results) {
					results[key].m10 = getM10(key);
				}
				if (res) {
					res.jsonp(results);
				}
				if (callback) {
					callback(results);
				}
			}
		);
	});
}

exports.getExchanges = function(req, res){
	res.json(trackers);
}

exports.getViews = function(req, res){
	var views = [
		['10 minutes', 'm10'],
		['1 hour', 'h1'],
		['3 hours', 'h3'],
		['12 hours', 'h12'],
		['Day', 'day'],
		['Week', 'week'],
		['Month', 'month'],
		['Year', 'year']
	];
	res.json(views);
}

exports.generateSummaries = function(mongoose, inputTrackers) {
	reduce.setMongoose(mongoose);
	runTrackers = inputTrackers || trackers;
	runTrackers.map(function(tracker) {
		console.log('Generating summaries for ' + tracker.name);
		reduce.generateSummaries(tracker, function(){
			console.log('Completed Summaries');
			reduce.backupSummaries();

			// Schedule to generate every two minutes
			tracker.genScheduled = tracker.genScheduled || false;
			if (!tracker.genScheduled) {
				tracker.genScheduled = true;
				new cronJob('0 * * * * *', function(){
					exports.generateSummaries(mongoose, [tracker]);
				}, null, true, 'America/Los_Angeles');

				new cronJob('30 * * * * *', function(){
					exports.generateSummaries(mongoose, [tracker]);
				}, null, true, 'America/Los_Angeles');
			}
		});
	});
}

exports.cleanup = function(mongoose) {
	reduce.setMongoose(mongoose);
	console.log('Starting cleanup');
	async.mapSeries(trackers,
		function(tracker, callback) {
			reduce.cleanup(tracker, function(){
				console.log('Finished cleanup for', tracker.name);
				callback();
			});
		},
		function() {
			console.log('Completed cleanup');
		}
	);
}
