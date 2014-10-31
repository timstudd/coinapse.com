(function(){
	module.exports = function(){
		var mongoose = require('mongoose');
		var Schema = mongoose.Schema;
		var files = ['tracker.js'];
		var fn = 0;
		for(fn in files) {
			var path_fn = './models/' + files[fn];
			var exported_model = require(path_fn);
			exported_model(mongoose, Schema);
		}
	};
})();
