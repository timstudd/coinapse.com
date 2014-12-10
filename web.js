require('newrelic');

var express = require('express')
  , app = express()
  , logfmt = require('logfmt')
  , mongoose = require('mongoose')
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)
  , tracking = require('./tracking')
  , cronJob = require('cron').CronJob;

process.on('uncaughtException', function (err) {
	console.log('Exception: ', err.stack);
});

mongoose.connect(process.env.MONGOLAB_URI, function(err) {
	if (err) {
		throw err;
	}
});

require('./register_models')();

// app.use(express.compress());
// app.use(logfmt.requestLogger());
// app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
	res.sendfile(__dirname + '/templates/index.html');
});

app.get('/robots.txt', function(req, res) {
	res.sendfile(__dirname + '/robots.txt');
});

app.get('/exchanges', function(req, res) {
	tracking.getExchanges(req, res);
});

app.get('/views', function(req, res){
	tracking.getViews(req, res);
});

console.log('Attempting to listen on: ', process.env.PORT);
server.listen(process.env.PORT || 3000);


app.configure('production', function(){
	app.get('/data', function(req, res) {
		tracking.summary(mongoose, req, res);
	});

	app.get('/clean', function(req, res) {
		tracking.cleanup(mongoose);
	});

	// Record tickers every two seconds
	new cronJob('*/2 * * * * *', function(){
		console.log('Recording tickers');
		tracking.track(mongoose, io);
	}, null, true, 'America/Los_Angeles');

	// Cleanup records twice per hour
	// new cronJob('0 */30 * * * *', function(){
	// 	tracking.cleanup(mongoose);
	// }, null, true, 'America/Los_Angeles');

	// Generate initial summaries
	// tracking.generateSummaries(mongoose);
});
