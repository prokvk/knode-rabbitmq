(function() {
  var _, amqp, async;

  amqp = require('amqplib/callback_api');

  _ = require('lodash');

  async = require('async');

  module.exports = function(config) {
    var _initBinding, amqpConn, channelPool, closeOnErr, defaultRoutingKey, exchangeParams, getChannel, getConnection, getSubscribeChannelName, messageParams, queueParams;
    queueParams = {
      durable: true,
      autoDelete: false,
      noAck: false
    };
    exchangeParams = _.extend(queueParams, {
      type: 'topic'
    });
    defaultRoutingKey = '#';
    messageParams = {
      contentType: 'application/json',
      deliveryMode: 2
    };
    amqpConn = null;
    channelPool = [];
    closeOnErr = function(err) {
      if (!err) {
        return false;
      }
      console.error("[AMQP] error", err);
      amqpConn.close();
      return true;
    };
    getSubscribeChannelName = function(queue) {
      return "q_" + queue;
    };
    getConnection = function(done) {
      if (amqpConn) {
        return done(null, amqpConn);
      }
      return amqp.connect(config.connection, function(err, conn) {
        if (err) {
          console.error("[AMQP]", err.message);
          if (closeOnErr(err)) {
            return done(err);
          }
        }
        conn.on("error", function(err) {
          if (err.message !== "Connection closing") {
            return console.error("[AMQP] conn error", err.message);
          }
        });
        conn.on("close", function() {
          return console.log("[AMQP] closing");
        });
        console.log("[AMQP] connected");
        amqpConn = conn;
        return done(null, amqpConn);
      });
    };
    getChannel = function(name, func, pool, done) {
      if (pool && (channelPool[name] != null)) {
        return done(null, channelPool[name]);
      }
      return getConnection(function(err, conn) {
        if (closeOnErr(err)) {
          return done(err);
        }
        return conn[func](function(err, ch) {
          if (closeOnErr(err)) {
            return done(err);
          }
          ch.on("error", function(err) {
            return console.error("[AMQP] channel error", err.message);
          });
          ch.on("close", function() {
            return console.log("[AMQP] channel closed");
          });
          if (pool) {
            channelPool[name] = ch;
          }
          return done(null, ch);
        });
      });
    };
    _initBinding = function(channel, queue, exchange, done) {
      return channel.assertExchange(exchange, exchangeParams.type, exchangeParams, function(err, ok) {
        if (closeOnErr(err)) {
          return done(err);
        }
        return channel.assertQueue(queue, queueParams, function(err, ok) {
          if (closeOnErr(err)) {
            return done(err);
          }
          return channel.bindQueue(queue, exchange, defaultRoutingKey, {}, done);
        });
      });
    };
    return {
      publish: function(exchange, message, done) {
        return getChannel('publish', 'createConfirmChannel', true, function(err, ch) {
          if (closeOnErr(err)) {
            return done(err);
          }
          message = new Buffer(JSON.stringify(message));
          return ch.publish(exchange, defaultRoutingKey, message, messageParams, function(err, ok) {
            if (err) {
              console.error("[AMQP] publish", err);
              if (closeOnErr(err)) {
                return done(err);
              }
            }
            return done();
          });
        });
      },
      subscribe: function(queue, done) {
        return getChannel(getSubscribeChannelName(queue), 'createChannel', true, function(err, ch) {
          var processMsg;
          if (closeOnErr(err)) {
            return done(err);
          }
          ch.prefetch(1);
          ch.assertQueue(queue, queueParams, function(err, _ok) {
            if (closeOnErr(err)) {
              return done(err);
            }
            ch.consume(queue, processMsg, {
              noAck: false
            });
            return console.log("Subscriber for queue '" + queue + "' is started");
          });
          return processMsg = function(msg) {
            return done(null, msg);
          };
        });
      },
      getMessageData: function(message) {
        return JSON.parse(message.content.toString());
      },
      messagesCount: function(queue, done) {
        return getChannel("etc", 'createChannel', true, function(err, ch) {
          return ch.assertQueue(queue, queueParams, function(err, res) {
            if (closeOnErr(err)) {
              return done(err);
            }
            return done(null, res.messageCount);
          });
        });
      },
      ack: function(queue, message) {
        return getChannel(getSubscribeChannelName(queue), 'createChannel', true, function(err, ch) {
          return ch.ack(message);
        });
      },
      nack: function(queue, message) {
        return getChannel(getSubscribeChannelName(queue), 'createChannel', true, function(err, ch) {
          return ch.reject(message, true);
        });
      },
      purge: function(queue, done) {
        return getChannel("etc", 'createChannel', true, function(err, ch) {
          if (closeOnErr(err)) {
            return done(err);
          }
          return ch.purgeQueue(queue, done);
        });
      },
      initBindings: function(done) {
        return getChannel("init_bindings", 'createChannel', false, (function(_this) {
          return function(err, ch) {
            if (closeOnErr(err)) {
              return done(err);
            }
            return async.eachSeries(Object.keys(config.bindings), function(binding, cb) {
              return _initBinding(ch, config.bindings[binding].queue, config.bindings[binding].exchange, cb);
            }, function(err) {
              if (err) {
                return done(err);
              }
              return ch.close(done);
            });
          };
        })(this));
      }
    };
  };

}).call(this);
