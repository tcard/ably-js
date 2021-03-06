"use strict";

define(['ably', 'shared_helper', 'async'], function(Ably, helper, async) {
	var exports = {},
		_exports = {},
		displayError = helper.displayError,
		closeAndFinish = helper.closeAndFinish,
		monitorConnection = helper.monitorConnection,
		createPM = Ably.Realtime.ProtocolMessage.fromDeserialized,
		testOnAllTransports = helper.testOnAllTransports;

	/* Helpers */

	function randomString() {
		return Math.random().toString().slice(2);
	}

	function checkCanSubscribe(channel, testChannel) {
		return function(callback) {
			var timeout,
				received = false,
				eventName = randomString();

			channel.subscribe(eventName, function(msg) {
				channel.unsubscribe(eventName);
				received = true;
				clearTimeout(timeout);
				callback();
			});

			testChannel.publish(eventName, null, function(err) {
				if(received)
					return;
				if(err)
					callback(err);
				timeout = setTimeout(function() {
					channel.unsubscribe(eventName);
					callback('checkCanSubscribe: message not received within 5s');
				}, 5000);
			});
		};
	}

	function checkCantSubscribe(channel, testChannel) {
		return function(callback) {
			var timeout,
				received = false,
				eventName = randomString();

			channel.subscribe(eventName, function(message) {
				channel.presence.unsubscribe(eventName);
				received = true;
				clearTimeout(timeout);
				callback('checkCantSubscribe: unexpectedly received message');
			});

			testChannel.publish(eventName, null, function(err) {
				if(received)
					return;
				if(err)
					callback(err);
				timeout = setTimeout(function() {
					channel.unsubscribe(eventName);
					callback();
				}, 500);
			});
		};
	}

	function checkCanPublish(channel) {
		return function(callback) {
			channel.publish(null, null, callback);
		};
	}

	function checkCantPublish(channel) {
		return function(callback) {
			channel.publish(null, null, function(err) {
				if(err && err.code === 40160) {
					callback();
				} else {
					callback(err || 'checkCantPublish: unexpectedly allowed to publish');
				}
			});
		};
	}

	function checkCanEnterPresence(channel) {
		return function(callback) {
			var clientId = randomString();
			channel.presence.enterClient(clientId, null, function(err) {
				channel.presence.leaveClient(clientId);
				callback(err);
			});
		};
	}

	function checkCantEnterPresence(channel) {
		return function(callback) {
			channel.presence.enterClient(randomString(), null, function(err) {
				if(err && err.code === 40160) {
					callback();
				} else {
					callback(err || 'checkCantEnterPresence: unexpectedly allowed to enter presence');
				}
			});
		};
	}

	function checkCanPresenceSubscribe(channel, testChannel) {
		return function(callback) {
			var timeout,
				received = false,
				clientId = randomString();

			channel.presence.subscribe('enter', function(message) {
				channel.presence.unsubscribe('enter');
				testChannel.presence.leaveClient(clientId);
				received = true;
				clearTimeout(timeout);
				callback();
			});

			testChannel.presence.enterClient(clientId, null, function(err) {
				if(received)
					return;
				if(err)
					callback(err);
				timeout = setTimeout(function() {
					channel.presence.unsubscribe('enter');
					testChannel.presence.leaveClient(clientId);
					callback('checkCanPresenceSubscribe: message not received within 5s');
				}, 5000);
			});
		};
	}

	function checkCantPresenceSubscribe(channel, testChannel) {
		return function(callback) {
			var timeout,
				received = false,
				clientId = randomString();

			channel.presence.subscribe('enter', function(message) {
				channel.presence.unsubscribe('enter');
				testChannel.presence.leaveClient(clientId);
				received = true;
				clearTimeout(timeout);
				callback('checkCantPresenceSubscribe: unexpectedly received message');
			});

			testChannel.presence.enterClient(clientId, null, function(err) {
				if(received)
					return;
				if(err)
					callback(err);
				timeout = setTimeout(function() {
					channel.presence.unsubscribe('enter');
					testChannel.presence.leaveClient(clientId);
					callback();
				}, 500);
			});
		};
	}

	/* Tests */

	exports.setupchannel = function(test) {
		test.expect(1);
		helper.setupApp(function(err) {
			if(err) {
				test.ok(false, helper.displayError(err));
			} else {
				test.ok(true, 'app set up');
			}
			test.done();
		});
	};

	/*
	 * Channel init with options
	 */
	testOnAllTransports(exports, 'channelinit0', function(realtimeOpts) { return function(test) {
		test.expect(4);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				/* set options on init */
				var channel0 = realtime.channels.get('channelinit0', {fakeOption: true});
				test.equal(channel0.channelOptions.fakeOption, true);

				/* set options on fetch */
				var channel1 = realtime.channels.get('channelinit0', {fakeOption: false});
				test.equal(channel0.channelOptions.fakeOption, false);
				test.equal(channel1.channelOptions.fakeOption, false);

				/* set options with setOptions */
				channel1.setOptions({fakeOption: true});
				test.equal(channel1.channelOptions.fakeOption, true);
				closeAndFinish(test, realtime);
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * Base attach case
	 */
	testOnAllTransports(exports, 'channelattach0', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var channel0 = realtime.channels.get('channelattach0');
				channel0.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));
					else
						test.ok(true, 'Attach to channel 0 with no options');
					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * Attach before connect
	 */
	testOnAllTransports(exports, 'channelattach2', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			var channel2 = realtime.channels.get('channelattach2');
			channel2.attach(function(err) {
				if(err)
					test.ok(false, 'Attach failed with error: ' + displayError(err));
				else
					test.ok(true, 'Attach to channel 0 with no options');
				closeAndFinish(test, realtime);
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * Attach then detach
	 */
	testOnAllTransports(exports, 'channelattach3', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var channel0 = realtime.channels.get('channelattach3');
				channel0.attach(function(err) {
					if(err) {
						test.ok(false, 'Attach failed with error: ' + displayError(err));
						closeAndFinish(test, realtime);
					}
					channel0.detach(function(err) {
						if(err) {
							test.ok(false, 'Detach failed with error: ' + displayError(err));
							closeAndFinish(test, realtime);
						}
						if(channel0.state == 'detached')
							test.ok(true, 'Attach then detach to channel 0 with no options');
						else
							test.ok(false, 'Detach failed: State is '+channel0.state);
						closeAndFinish(test, realtime);
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}}, true); /* NB upgrade is excluded because realtime now sends an ATTACHED
	* post-upgrade, which can race with the DETACHED if the DETACH is only sent
	* just after upgrade. Re-include it with 1.1 spec which has IDs in ATTACHs */

	/*
	 * Attach with an empty channel and expect a channel error
	 * and the connection to remain open
	 */
	testOnAllTransports(exports, 'channelattachempty', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.once('connected', function() {
				var channel0 = realtime.channels.get('');
				channel0.attach(function(err) {
					if(err) {
						test.expect(2);
						test.ok(true, 'Attach failed as expected');
						setTimeout(function() {
							test.ok(realtime.connection.state === 'connected', 'Client should still be connected');
							closeAndFinish(test, realtime);
						}, 1000);
						return;
					}
					test.ok(false, 'Unexpected attach success');
					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * Attach with an invalid channel name and expect a channel error
	 * and the connection to remain open
	 */
	testOnAllTransports(exports, 'channelattachinvalid', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.once('connected', function() {
				var channel = realtime.channels.get(':hell')
				channel.attach(function(err) {
					if(err) {
						test.expect(4);
						test.ok(true, 'Attach failed as expected');
						test.equal(channel.errorReason.code, 40010, 'Attach error was set as the channel errorReason');
						test.equal(err.code, 40010, 'Attach error was passed to the attach callback');
						setTimeout(function() {
							test.ok(realtime.connection.state === 'connected', 'Client should still be connected');
							closeAndFinish(test, realtime);
						}, 1000);
						return;
					}
					test.ok(false, 'Unexpected attach success');
					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * Publishing on a nonattached channel
	 */
	testOnAllTransports(exports, 'publish_no_attach', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.once('connected', function() {
				realtime.channels.get('publish_no_attach').publish(function(err) {
					if(err) {
						test.ok(false, 'Unexpected attach failure: ' + helper.displayError(err));
						closeAndFinish(test, realtime);
						return;
					}
					test.ok(true, 'publish succeeded');
					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'publish_no_attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * publishing on a nonattached channel with an invalid channel name
	 */
	testOnAllTransports(exports, 'channelattach_publish_invalid', function(realtimeOpts) { return function(test) {
		test.expect(2);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.once('connected', function() {
				realtime.channels.get(':hell').publish(function(err) {
					if(err) {
						test.ok(true, 'publish failed as expected');
						test.equal(err.code, 40010, "correct error code")
						closeAndFinish(test, realtime);
						return;
					}
					test.ok(false, 'Unexpected attach success');
					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channelattach_publish_invalid failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/*
	 * Attach with an invalid channel name and expect a channel error
	 * and the connection to remain open
	 */
	testOnAllTransports(exports, 'channelattach_invalid_twice', function(realtimeOpts) { return function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.once('connected', function() {
				realtime.channels.get(':hell').attach(function(err) {
					if(err) {
						test.expect(2);
						test.ok(true, 'Attach failed as expected');
						/* attempt second attach */
						realtime.channels.get(':hell').attach(function(err) {
							if(err) {
								test.expect(3);
								test.ok(true, 'Attach (second attempt) failed as expected');
								setTimeout(function() {
									test.ok(realtime.connection.state === 'connected', 'Client should still be connected');
									closeAndFinish(test, realtime);
								}, 1000);
								return;
							}
							test.ok(false, 'Unexpected attach (second attempt) success');
							closeAndFinish(test, realtime);
						});
						return;
					}
					test.ok(false, 'Unexpected attach success');
					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});


	/*
	 * Attach then later call whenState which fires immediately
	 */
	exports.channelattachOnceOrIfAfter = function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(),
					channel = realtime.channels.get('channelattachOnceOrIf'),
					firedImmediately = false;

			channel.attach(function(err) {
				channel.whenState('attached', function() {
					firedImmediately = true;
				});
				test.ok(firedImmediately, 'whenState fired immediately as attached');
				closeAndFinish(test, realtime);
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Attach and call whenState before attach which fires later
	 */
	exports.channelattachOnceOrIfBefore = function(test) {
		test.expect(2);
		try {
			var realtime = helper.AblyRealtime(),
					channel = realtime.channels.get('channelattachOnceOrIf'),
					firedImmediately = false;

			channel.attach();
			channel.whenState('attached', function() {
				firedImmediately = true;
				test.equal(channel.state, 'attached', 'whenState fired when attached');
				closeAndFinish(test, realtime);
			});
			test.ok(!firedImmediately, 'whenState should not fire immediately as not attached');
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	testOnAllTransports(exports, 'attachWithChannelParamsBasicChannelsGet', function(realtimeOpts) { return function(test) {
		test.expect(3);
		var testName = 'attachWithChannelParamsBasicChannelsGet';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var params = {
					modes: 'subscribe',
					delta: 'vcdiff'
				};
				var channelOptions = {
					params: params
				};
				var channel = realtime.channels.get(testName, channelOptions);
				channel.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));
					test.deepEqual(channel.channelOptions, channelOptions, 'Check requested channel options');
					test.deepEqual(channel.params, params, 'Check result params');
					test.deepEqual(channel.modes, ['subscribe'], 'Check result modes');

					var testRealtime = helper.AblyRealtime();
					testRealtime.connection.on('connected', function() {
						var testChannel = testRealtime.channels.get(testName);
						async.series([
							checkCanSubscribe(channel, testChannel),
							checkCantPublish(channel),
							checkCantEnterPresence(channel),
							checkCantPresenceSubscribe(channel, testChannel)
						], function(err) {
							if(err)
								test.ok(false, 'Mode check failed with error: ' + displayError(err));
							testRealtime.close();
							closeAndFinish(test, realtime);
						});
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	testOnAllTransports(exports, 'attachWithChannelParamsBasicSetOptions', function(realtimeOpts) { return function(test) {
		test.expect(3);
		var testName = 'attachWithChannelParamsBasicSetOptions';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var params = {
					modes: 'subscribe',
					delta: 'vcdiff'
				};
				var channelOptions = {
					params: params
				};
				var channel = realtime.channels.get(testName);
				channel.setOptions(channelOptions);
				channel.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));
					test.deepEqual(channel.channelOptions, channelOptions, 'Check requested channel options');
					test.deepEqual(channel.params, params, 'Check result params');
					test.deepEqual(channel.modes, ['subscribe'], 'Check result modes');

					var testRealtime = helper.AblyRealtime();
					testRealtime.connection.on('connected', function() {
						var testChannel = testRealtime.channels.get(testName);
						async.series([
							checkCanSubscribe(channel, testChannel),
							checkCantPublish(channel),
							checkCantEnterPresence(channel),
							checkCantPresenceSubscribe(channel, testChannel)
						], function(err) {
							if(err)
								test.ok(false, 'Mode check failed with error: ' + displayError(err));
							testRealtime.close();
							closeAndFinish(test, realtime);
						});
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	testOnAllTransports(exports, 'subscribeAfterSetOptions', function(realtimeOpts) { return function(test) {
		test.expect(1);
		var testName = 'subscribeAfterSetOptions';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var channel = realtime.channels.get(testName);
				channel.setOptions({
					params: {
						modes: 'publish,subscribe'
					}
				});
				var testData = 'Test data';
				channel.subscribe(function(message) {
					test.equal(message.data, testData, 'Check data');
					closeAndFinish(test, realtime);
				});
				channel.publish(undefined, testData);
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	exports.channelGetShouldThrowWhenWouldCauseReattach = function(test) {
		test.expect(3);
		var testName = 'channelGetShouldThrowWhenWouldCauseReattach';
		try {
			var realtime = helper.AblyRealtime();
			realtime.connection.on('connected', function() {
				var params = {
					modes: 'subscribe',
					delta: 'vcdiff'
				};
				var channel = realtime.channels.get(testName, {
					params: params
				});
				channel.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));

					try {
						realtime.channels.get(testName, {
							params: params
						});
					} catch(e) {
						test.equal(e.code, 40000, 'Check error code');
						test.equal(e.statusCode, 400, 'Check error status code');
						test.ok(e.message.includes('setOptions'), 'Check error message');
						closeAndFinish(test, realtime);
					}
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	testOnAllTransports(exports, 'setOptionsCallbackBehaviour', function(realtimeOpts) { return function(test) {
		test.expect(6);
		var testName = 'setOptionsCallbackBehaviour';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var params = {
					modes: 'subscribe',
					delta: 'vcdiff'
				};
				var modes = ['publish'];
				var channel = realtime.channels.get(testName);

				async.series([
					function(cb) {
						var setOptionsReturned = false;
						channel.setOptions({
							params: params,
							modes: modes
						}, function() {
							test.ok(!setOptionsReturned, 'setOptions failed to call back immediately, when no reattach is required');
							cb();
						});
						setOptionsReturned = true;
					},
					function(cb) {
						channel.attach(cb);
					},
					function(cb) {
						var channelUpdated = false;
						channel._allChannelChanges.on('update', function() {
							channelUpdated = true;
						});

						var setOptionsReturned = false;
						channel.setOptions({
							params: params
						}, function() {
							/* Wait a tick so we don't depend on whether the update event runs the
							 * channelUpdated listener or the setOptions listener first */
							helper.Utils.nextTick(function() {
								test.ok(setOptionsReturned, 'setOptions should return immediately and call back after the reattach');
								test.ok(channelUpdated, 'Check channel went to the server to update the channel params');
								cb();
							});
						});
						setOptionsReturned = true;
					},
					function(cb) {
						var channelUpdated = false;
						channel._allChannelChanges.on('update', function() {
							channelUpdated = true;
						});

						var setOptionsReturned = false;
						channel.setOptions({
							modes: modes
						}, function() {
							helper.Utils.nextTick(function() {
								test.ok(setOptionsReturned, 'setOptions should return immediately and call back after the reattach');
								test.ok(channelUpdated, 'Check channel went to the server to update the channel mode');
								cb();
							});
						});
						setOptionsReturned = true;
					},
					function(cb) {
						var setOptionsReturned = false;
						channel.setOptions({ }, function() {
							test.ok(!setOptionsReturned, 'setOptions failed to call back immediately, when no reattach is required');
							cb();
						});
						setOptionsReturned = true;
					}
				], function(err) {
					if(err)
						test.ok(false, testName + ' failed with error: ' + displayError(err));

					closeAndFinish(test, realtime);
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	/* Verify modes is ignored when params.modes is present */
	testOnAllTransports(exports, 'attachWithChannelParamsModesAndChannelModes', function(realtimeOpts) { return function(test) {
		test.expect(3);
		var testName = 'attachWithChannelParamsModesAndChannelModes';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var paramsModes = ['presence', 'subscribe'];
				var params = {
					modes: paramsModes.join(',')
				};
				var channelOptions = {
					params: params,
					modes: ['publish', 'presence_subscribe']
				};
				var channel = realtime.channels.get(testName, channelOptions);
				channel.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));
					test.deepEqual(channel.channelOptions, channelOptions, 'Check requested channel options');
					test.deepEqual(channel.params, params, 'Check result params');
					test.deepEqual(channel.modes, paramsModes, 'Check result modes');

					var testRealtime = helper.AblyRealtime();
					testRealtime.connection.on('connected', function() {
						var testChannel = testRealtime.channels.get(testName);
						async.series([
							checkCanSubscribe(channel, testChannel),
							checkCanEnterPresence(channel),
							checkCantPublish(channel),
							checkCantPresenceSubscribe(channel, testChannel)
						], function(err) {
							if(err)
								test.ok(false, 'Mode check failed with error: ' + displayError(err));
							testRealtime.close();
							closeAndFinish(test, realtime);
						});
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	testOnAllTransports(exports, 'attachWithChannelModes', function(realtimeOpts) { return function(test) {
		test.expect(2);
		var testName = 'attachWithChannelModes';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var modes = ['publish', 'presence_subscribe'];
				var channelOptions = {
					modes: modes
				};
				var channel = realtime.channels.get(testName, channelOptions);
				channel.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));
					test.deepEqual(channel.channelOptions, channelOptions, 'Check requested channel options');
					test.deepEqual(channel.modes, modes, 'Check result modes');

					var testRealtime = helper.AblyRealtime();
					testRealtime.connection.on('connected', function() {
						var testChannel = testRealtime.channels.get(testName);
						async.series([
							checkCanPublish(channel),
							checkCanPresenceSubscribe(channel, testChannel),
							checkCantSubscribe(channel, testChannel),
							checkCantEnterPresence(channel)
						], function(err) {
							if(err)
								test.ok(false, 'Mode check failed with error: ' + displayError(err));
							testRealtime.close();
							closeAndFinish(test, realtime);
						});
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	testOnAllTransports(exports, 'attachWithChannelParamsDeltaAndModes', function(realtimeOpts) { return function(test) {
		test.expect(3);
		var testName = 'attachWithChannelParamsDeltaAndModes';
		try {
			var realtime = helper.AblyRealtime(realtimeOpts);
			realtime.connection.on('connected', function() {
				var modes = ['publish', 'subscribe', 'presence_subscribe'];
				var channelOptions = {
					modes: modes,
					params: { delta: 'vcdiff' }
				};
				var channel = realtime.channels.get(testName, channelOptions);
				channel.attach(function(err) {
					if(err)
						test.ok(false, 'Attach failed with error: ' + displayError(err));
					test.deepEqual(channel.channelOptions, channelOptions, 'Check requested channel options');
					test.deepEqual(channel.params, { delta: 'vcdiff' }, 'Check result params');
					test.deepEqual(channel.modes, modes, 'Check result modes');

					var testRealtime = helper.AblyRealtime();
					testRealtime.connection.on('connected', function() {
						var testChannel = testRealtime.channels.get(testName);
						async.series([
							checkCanPublish(channel),
							checkCanSubscribe(channel, testChannel),
							checkCanPresenceSubscribe(channel, testChannel),
							checkCantEnterPresence(channel)
						], function(err) {
							if(err)
								test.ok(false, 'Mode check failed with error: ' + displayError(err));
							testRealtime.close();
							closeAndFinish(test, realtime);
						});
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	}});

	exports.attachWithInvalidChannelParams = function(test) {
		test.expect(18);
		var testName = 'attachWithInvalidChannelParams';
		var defaultChannelModes = 'presence,publish,subscribe,presence_subscribe';
		try {
			var realtime = helper.AblyRealtime();
			realtime.connection.on('connected', function() {
				var channel = realtime.channels.get(testName);
				async.series([
					function(cb) {
						channel.attach(function(err) {
							cb(err);
						});
					},
					function(cb) {
						var channelOptions = {
							modes: 'subscribe'
						};
						channel.setOptions(channelOptions, function(err) {
							test.equal(err.code, 40000, 'Check channelOptions validation error code');
							test.equal(err.statusCode, 400, 'Check channelOptions validation error statusCode');
							test.equal(channel.modes, defaultChannelModes, 'Check channel options modes result');
							cb();
						});
					},
					function(cb) {
						var channelOptions = {
							modes: [1, 'subscribe']
						};
						channel.setOptions(channelOptions, function(err) {
							test.equal(err.code, 40000, 'Check channelOptions validation error code');
							test.equal(err.statusCode, 400, 'Check channelOptions validation error statusCode');
							test.equal(channel.modes, defaultChannelModes, 'Check channel options modes result');
							cb();
						});
					},
					function(cb) {
						var channelOptions = {
							params: 'test'
						};
						channel.setOptions(channelOptions, function(err) {
							test.equal(err.code, 40000, 'Check channelOptions validation error code');
							test.equal(err.statusCode, 400, 'Check channelOptions validation error statusCode');
							test.deepEqual(channel.params, {}, 'Check channel options params');
							cb();
						});
					},
					function(cb) {
						/* not malformed, but not recognised so we should end up with an empty params object*/
						var channelOptions = {
							params: {'nonexistent': 'foo'}
						};
						channel.setOptions(channelOptions, function() {
							test.deepEqual(channel.params, {}, 'Check channel params');
							cb();
						});
					},
					function(cb) {
						var channelOptions = {
							modes: undefined
						};
						channel.setOptions(channelOptions, function(err) {
							test.equal(err.code, 40000, 'Check channelOptions validation error code');
							test.equal(err.statusCode, 400, 'Check channelOptions validation error statusCode');
							test.deepEqual(channel.params, {}, 'Check channel options params result');
							test.equal(channel.modes, defaultChannelModes, 'Check channel options modes result');
							cb();
						});
					},
					function(cb) {
						var channelOptions = {
							modes: ['susribe']
						};
						channel.setOptions(channelOptions, function(err) {
							test.equal(err.code, 40000, 'Check channelOptions validation error code');
							test.equal(err.statusCode, 400, 'Check channelOptions validation error statusCode');
							test.deepEqual(channel.params, {}, 'Check channel options params result');
							test.equal(channel.modes, defaultChannelModes, 'Check channel options modes result');
							cb();
						});
					}
				], function(err) {
					if(err)
						test.ok(false, testName + ' failed with error: ' + displayError(err));

					closeAndFinish(test, realtime);
				})
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, testName + ' failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Subscribe, then unsubscribe, binary transport
	 */
	exports.channelsubscribe0 = function(test) {
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime({ useBinaryProtocol: true });
			realtime.connection.on('connected', function() {
				var channel6 = realtime.channels.get('channelsubscribe0');
				channel6.attach(function(err) {
					if(err) {
						test.ok(false, 'Attach failed with error: ' + displayError(err));
						closeAndFinish(test, realtime);
					}
					try {
						channel6.subscribe('event0', function() {});
						setTimeout(function() {
							try {
								channel6.unsubscribe('event0', function() {});
								test.ok(true, 'Subscribe then unsubscribe to channel6:event0 with no options');
								closeAndFinish(test, realtime);
							} catch(e) {
								test.ok(false, 'Unsubscribe failed with error: ' + e.stack);
								closeAndFinish(test, realtime);
							}
						}, 1000);
					} catch(e) {
						test.ok(false, 'Subscribe failed with error: ' + e);
						closeAndFinish(test, realtime);
					}
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel subscribe failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Subscribe, then unsubscribe listeners by event, by listener, and then all events & listener
	 */
	exports.channelsubscribe1 = function(test) {
		var messagesReceived = 0;
		test.expect(7);

		try {
			var realtime = helper.AblyRealtime();
			var channelByEvent, channelByListener, channelAll;

			var unsubscribeTest = function() {
				channelByEvent.unsubscribe('event', listenerByEvent);
				channelByListener.unsubscribe(listenerNoEvent);
				channelAll.unsubscribe();
				channelByEvent.publish('event', 'data', function(err) {
					test.ok(!err, 'Error publishing single event: ' + err);
					channelByListener.publish(null, 'data', function(err) {
						test.ok(!err, 'Error publishing any event: ' + err);
						channelAll.publish(null, 'data', function(err) {
							test.ok(!err, 'Error publishing any event: ' + err);
							test.equal(messagesReceived, 3, 'Only three messages should be received by the listeners');
							closeAndFinish(test, realtime);
						});
					});
				});
			};

			var listenerByEvent = function() {
				test.ok(true, 'received event "event" on channel');
				messagesReceived += 1;
				if (messagesReceived == 3) { unsubscribeTest(); }
			};
			var listenerNoEvent = function() {
				test.ok(true, 'received any event on channel');
				messagesReceived += 1;
				if (messagesReceived == 3) { unsubscribeTest(); }
			};
			var listenerAllEvents = function() { return listenerNoEvent(); };

			realtime.connection.on('connected', function() {
				channelByEvent = realtime.channels.get('channelsubscribe1-event');
				channelByEvent.subscribe('event', listenerByEvent, function() {
					channelByEvent.publish('event', 'data');
					channelByListener = realtime.channels.get('channelsubscribe1-listener');
					channelByListener.subscribe(null, listenerNoEvent, function() {
						channelByListener.publish(null, 'data');
						channelAll = realtime.channels.get('channelsubscribe1-all');
						channelAll.subscribe(listenerAllEvents, function() {
							channelAll.publish(null, 'data');
						});
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel subscribe failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/* RTL13
	 * A server-sent DETACHED, with err, should cause the channel to attempt an
	 * immediate reattach. If that fails, it should go into suspended
	 */
	exports.server_sent_detached = function(test) {
		var realtime = helper.AblyRealtime({transports: [helper.bestTransport]}),
			channelName = 'server_sent_detached',
			channel = realtime.channels.get(channelName);

		test.expect(4);
		async.series([
			function(cb) {
				realtime.connection.once('connected', function() { cb(); });
			},
			function(cb) {
				channel.attach(cb);
			},
			function(cb) {
				/* Sabotage the reattach attempt, then simulate a server-sent detach */
				channel.sendMessage = function() {};
				realtime.options.timeouts.realtimeRequestTimeout = 100;
				channel.once(function(stateChange) {
					test.equal(stateChange.current, 'attaching', 'Channel reattach attempt happens immediately');
					test.equal(stateChange.reason.code, 50000, 'check error is propogated in the reason');
					cb();
				});
				var transport = realtime.connection.connectionManager.activeProtocol.getTransport();
				transport.onProtocolMessage(createPM({action: 13, channel: channelName, error: {statusCode: 500, code: 50000, message: "generic serverside failure"}}));
			},
			function(cb) {
				channel.once(function(stateChange) {
					test.equal(stateChange.current, 'suspended', 'Channel we go into suspended');
					test.equal(stateChange.reason && stateChange.reason.code, 90007, 'check error is now the timeout');
					cb();
				});
			}
		], function(err) {
			if(err) test.ok(false, helper.displayError(err));
			closeAndFinish(test, realtime);
		});
	};

	/*
	 * A server-sent DETACHED, with err, while in the attaching state, should
	 * result in the channel becoming suspended
	 */
	exports.server_sent_detached_while_attaching = function(test) {
		var realtime = helper.AblyRealtime({transports: [helper.bestTransport]}),
			channelName = 'server_sent_detached_while_attaching',
			channel = realtime.channels.get(channelName);

		test.expect(4);
		realtime.connection.once('connected', function() {
			var transport = realtime.connection.connectionManager.activeProtocol.getTransport();
			/* Mock sendMessage to respond to attaches with a DETACHED */
			channel.sendMessage = function(msg) {
				test.equal(msg.action, 10, 'check attach action');
				test.ok(true, 'Attach attempt');
				helper.Utils.nextTick(function() {
					transport.onProtocolMessage(createPM({
						action: 13,
						channel: channelName,
						error: {statusCode: 500, code: 50000, message: "generic serverside failure"}
					}));
				});
			};
			channel.attach(function(err) {
				test.equal(err.code, 50000, 'check error is propogated to the attach callback');
				test.equal(channel.state, 'suspended', 'check channel goes into suspended');
				closeAndFinish(test, realtime);
			});
		});
	};

	/*
	 * A server-sent ERROR, with channel field, should fail the channel
	 */
	exports.server_sent_error = function(test) {
		var realtime = helper.AblyRealtime({transports: [helper.bestTransport]}),
			channelName = 'server_sent_error',
			channel = realtime.channels.get(channelName);

		test.expect(2);
		realtime.connection.once('connected', function() {
			channel.attach(function(err) {
				if(err) {
					test.ok(false, helper.displayError(err));
					closeAndFinish(test, realtime);
					return;
				}

				channel.on('failed', function(stateChange) {
					test.ok(true, 'Channel was failed');
					test.equal(stateChange.reason.code, 50000, 'check error is propogated');
					closeAndFinish(test, realtime);
				});
				var transport = realtime.connection.connectionManager.activeProtocol.getTransport();
				transport.onProtocolMessage(createPM({action: 9, channel: channelName, error: {statusCode: 500, code: 50000, message: "generic serverside failure"}}));
			});
		});
	};

	/* RTL12
	 * A server-sent ATTACHED indicating a loss of connection continuity (i.e.
	 * with no resumed flag, possibly with an error) on an attached channel
	 * should emit an UPDATE event on the channel
	 */
	exports.server_sent_attached_err = function(test) {
		var realtime = helper.AblyRealtime(),
			channelName = 'server_sent_attached_err',
			channel = realtime.channels.get(channelName);

		test.expect(6);
		async.series([
			function(cb) {
				realtime.connection.once('connected', function() { cb(); });
			},
			function(cb) {
				channel.attach(cb);
			},
			function(cb) {
				channel.once(function(stateChange) {
					test.equal(this.event, 'update', 'check is error event');
					test.equal(stateChange.current, 'attached', 'check current');
					test.equal(stateChange.previous, 'attached', 'check previous');
					test.equal(stateChange.resumed, false, 'check resumed');
					test.equal(stateChange.reason.code, 50000, 'check error propogated');
					test.equal(channel.state, 'attached', 'check channel still attached');
					cb();
				});
				var transport = realtime.connection.connectionManager.activeProtocol.getTransport();
				transport.onProtocolMessage(createPM({action: 11, channel: channelName, error: {statusCode: 500, code: 50000, message: "generic serverside failure"}}));
			}
		], function(err) {
			if(err) test.ok(false, helper.displayError(err));
			closeAndFinish(test, realtime);
		});
	};

	/*
	 * Check that queueMessages: false disables queuing for connection queue state
	 */
	exports.publish_no_queueing = function(test) {
		test.expect(1);
		var realtime = helper.AblyRealtime({ queueMessages: false }),
			channel = realtime.channels.get('publish_no_queueing');

		/* try a publish while not yet connected */
		channel.publish('foo', 'bar', function(err) {
			test.ok(err, 'Check publish while disconnected/connecting is rejected');
			closeAndFinish(test, realtime);
		});
	};

	/*
	 * A channel attach that times out should be retried
	 */
	exports.channel_attach_timeout = function(test) {
		test.expect(4);
		/* Use a fixed transport as attaches are resent when the transport changes */
		var realtime = helper.AblyRealtime({transports: [helper.bestTransport], realtimeRequestTimeout: 100, channelRetryTimeout: 100}),
			channelName = 'channel_attach_timeout',
			channel = realtime.channels.get(channelName);

		/* Stub out the channel's ability to communicate */
		channel.sendMessage = function() {};

		async.series([
			function(cb) {
				realtime.connection.once('connected', function() { cb(); });
			},
			function(cb) {
				channel.attach(function(err) {
					test.ok(err, 'Channel attach timed out as expected');
					test.equal(err && err.code, 90007, 'Attach timeout err passed to attach callback');
					test.equal(channel.state, 'suspended', 'Check channel state goes to suspended');
					cb();
				});
			},
			function(cb) {
				/* nexttick so that it doesn't pick up the suspended event */
				helper.Utils.nextTick(function() {
					channel.once(function(stateChange) {
						test.equal(stateChange.current, 'attaching', 'Check channel tries again after a bit');
						cb();
					});
				});
			}
		], function() {
			closeAndFinish(test, realtime);
		});
	};

	/* RTL3c, RTL3d
	 * Check channel state implications of connection going into suspended
	 */
	exports.suspended_connection = function(test) {
		/* Use a fixed transport as attaches are resent when the transport changes */
		/* Browsers throttle setTimeouts to min 1s in in active tabs; having timeouts less than that screws with the relative timings */
		var realtime = helper.AblyRealtime({transports: [helper.bestTransport], channelRetryTimeout: 1010, suspendedRetryTimeout: 1100}),
			channelName = 'suspended_connection',
			channel = realtime.channels.get(channelName);

		test.expect(5);
		async.series([
			function(cb) {
				realtime.connection.once('connected', function() { cb(); });
			},
			function(cb) {
				channel.attach(cb);
			},
			function(cb) {
				/* Have the connection go into the suspended state, and check that the
				 * channel goes into the suspended state and doesn't try to reattach
				 * until the connection reconnects */
				channel.sendMessage = function(msg) {
					test.ok(false, 'Channel tried to send a message ' + JSON.stringify(msg));
				};
				realtime.options.timeouts.realtimeRequestTimeout = 100;

				helper.becomeSuspended(realtime, function() {
					/* nextTick as connection event is emitted before channel state is changed */
					helper.Utils.nextTick(function() {
						test.equal(channel.state, 'suspended', 'check channel state is suspended');
						cb();
					});
				});
			},
			function(cb) {
				realtime.connection.once(function(stateChange) {
					test.equal(stateChange.current, 'connecting', 'Check we try to connect again');
					/* We no longer want to fail the test for an attach, but still want to sabotage it */
					channel.sendMessage = function() {};
					cb();
				});
			},
			function(cb) {
				channel.once(function(stateChange) {
					test.equal(stateChange.current, 'attaching', 'Check that once connected we try to attach again');
					cb();
				});
			},
			function(cb) {
				channel.once(function(stateChange) {
					test.equal(stateChange.current, 'suspended', 'Check that the channel goes back into suspended after attach fails');
					test.equal(stateChange.reason && stateChange.reason.code, 90007, 'Check correct error code');
					cb();
				});
			}
		], function(err) {
			if(err) test.ok(false, helper.displayError(err));
			closeAndFinish(test, realtime);
		});
	};


	return module.exports = helper.withTimeout(exports);
});
