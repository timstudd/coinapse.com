(function() {
	module.exports = function(mongoose, Schema) {
		var Tracker = new Schema({
			tracker	: String
			, date	: { type : Date, default : Date.now }
			, last	: Number
		});

		mongoose.model("Tracker", Tracker);
	}

	console.log("Registered Tracker Model");
})();
