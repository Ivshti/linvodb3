var linvodb = require('linvodb')

// Use leveljs (IndexedDB wrapper) for storage
linvodb.defaults.store = { db: require('level-js') };

var Task = new linvodb('task', {
	name: String,
	description: String,
	created: Date,
	due: Date,
	completed: Boolean
}, { });

Task.on('construct', function(task) {
	task.due = new Date(Date.now() + 24*60*60*1000)
})

var app = angular.module('todo', [])

app.controller('todoList', ['$scope', function($scope) {
	$scope.tasks = Task.find({ }).live()
	$scope.incomplete = Task.find({ completed: false }).count().live()

	$scope.selected = new Task()

	Task.on('liveQueryUpdate', function() { $scope.$digest() })

	$scope.newTask = function() { $scope.selected = new Task() }
}])