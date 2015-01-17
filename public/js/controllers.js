coinapse.controller('CoinapseCtrl', ['$scope', '$http', 'socket', function($scope, $http, socket) {
	$scope.config = {
		chart: {
			options: {
				legend: {
					position: 'nw',
					backgroundOpacity: 0
				},
				grid: { hoverable: true },
				lines: { show: true },
				xaxis: {
					mode: 'time',
					timezone: 'browser'
				},
				yaxis: {
					position: 'right',
					minTickSize: 1,
					font: {
						color: 'black'
					}
				}
			},
			target: $('#chart')
		}
	}

	$scope.safeApply = function(fn) {
		var phase = $scope.$root.$$phase;
		if(phase == '$apply' || phase == '$digest') {
			if(fn && (typeof(fn) === 'function')) {
				fn();
			}
		} else {
			$scope.$apply(fn);
		}
	}

	$scope.getStats = function() {
		var results = {};
		for (var key in $scope.data) {
			if ($scope.data[key].length == 0) { continue; }
			results[key] = {};
			for (var optionKey in $scope.data[key]) {
				if ($scope.data[key][optionKey].length == 0) { continue; }
				for (var i = 0; i < $scope.data[key][optionKey].length; i++) {
					if (i == 0){
						results[key][optionKey] = {};
						results[key][optionKey].low = $scope.data[key][optionKey][i][1];
						results[key][optionKey].high = $scope.data[key][optionKey][i][1];
						results[key][optionKey].start = $scope.data[key][optionKey][i][1];
						continue;
					}
					if (results[key][optionKey].low > $scope.data[key][optionKey][i][1]) {
						results[key][optionKey].low = $scope.data[key][optionKey][i][1];
					}
					if (results[key][optionKey].high < $scope.data[key][optionKey][i][1]) {
						results[key][optionKey].high = $scope.data[key][optionKey][i][1];
					}
					if (i == $scope.data[key][optionKey].length - 1) {
						results[key][optionKey].end = $scope.data[key][optionKey][i][1];
						results[key][optionKey].deltaPercent = (1 - results[key][optionKey].end / results[key][optionKey].start) * -100.000;
						results[key][optionKey].deltaDollar = results[key][optionKey].end - results[key][optionKey].start;
					}
				}
			}
		}
		$scope.stats = results;
	}

	$scope.updateChart = function() {
		var plotData = [];
		if (!$scope.exchanges || !$scope.data) return;
		for (var i = 0; i < $scope.exchanges.length; i++) {
			var exchange = $scope.exchanges[i];
			if (!exchange.enabled) { continue; };
			plotData.push({
				label: exchange.title,
				data: $scope.data[exchange.name][$scope.view]
			});
		}
		$.plot($scope.config.chart.target, plotData, $scope.config.chart.options);
	}

	$scope.setChartHeight = function() {
		$scope.config.chart.target.css('height', $(window).height() * 0.7);
	}

	$scope.setView = function(view){
		$scope.view = view;
		$scope.updateChart();
	}

	$scope.viewTitle = function(){
		if (!$scope.views) return;
		for (var i = 0; i < $scope.views.length; i++){
			if ($scope.views[i][1] == $scope.view){
				return $scope.views[i][0];
			}
		}
	}

	$scope.getData = function(){
		$.getJSON(coinapse.config.datasourceSecure + 'data/?callback=?').success(function(data){
			$scope.processData(data);
			$scope.safeApply();
		});
	}

	$scope.getViews = function(){
		$http.get('/views').
			success(function(data, status, headers, config){
				$scope.views = data;
				$scope.setView(data[0][1]);
			});
	}

	$scope.getExchanges = function(){
		$http.get('/exchanges').
			success(function(data, status, headers, config){
				for (var i = 0; i < data.length; i++){
					data[i].enabled = true;
				}
				$scope.exchanges = data;
			});
	}

	$scope.processData = function(data){
		$scope.data = data;
		$scope.getStats();
		$scope.updateChart();
	}

	$scope.initTooltips = function() {
		$scope.config.chart.target.on('plothover', function (event, pos, item) {
			if (item) {
				var y = item.datapoint[1].toFixed(2);
				$('#tooltip').remove();
				$('<div/>').
					attr('id', 'tooltip').
					html(item.series.label + ': ' + y).
					css({ top:  item.pageY - 40, left: item.pageX - 30 }).
					appendTo('body').
					fadeIn(200);
				return;
			}
			$('#tooltip').remove();
		});
	}

	$scope.init = function() {
		$scope.getData();
		$scope.getViews();
		$scope.getExchanges();
		$scope.setChartHeight();
		$scope.initTooltips();

		$.plot($scope.config.chart.target, [], $scope.config.chart.options);

		socket.on('update', function(data){
			$scope.processData(data);
		});

		$(window).resize(function(){
			$scope.setChartHeight();
		});
	}
}]);
