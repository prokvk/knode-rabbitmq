amqp = require 'amqplib/callback_api'
_ = require 'lodash'
async = require 'async'

module.exports = (config) ->
	queueParams =
		durable: true
		autoDelete: false
		noAck: false

	exchangeParams = _.extend queueParams, {type: 'topic'}

	defaultRoutingKey = '#'

	messageParams =
		contentType: 'application/json'
		deliveryMode: 2

	amqpConn = null
	channelPool = []

	closeOnErr = (err) ->
		return false unless err
		console.error "[AMQP] error", err
		amqpConn.close()
		true

	getSubscribeChannelName = (queue) -> "q_#{queue}"

	getConnection = (done) ->
		return done null, amqpConn if amqpConn

		amqp.connect config.connection, (err, conn) ->
			if err
				console.error "[AMQP]", err.message
				return done err if closeOnErr(err)

			conn.on "error", (err) ->
				console.error "[AMQP] conn error", err.message if err.message isnt "Connection closing"

			conn.on "close", () ->
				console.log "[AMQP] closing"

			console.log "[AMQP] connected"
			amqpConn = conn
			done null, amqpConn

	getChannel = (name, func, pool, done) ->
		return done null, channelPool[name] if pool and channelPool[name]?

		getConnection (err, conn) ->
			return done err if closeOnErr(err)

			conn[func] (err, ch) ->
				return done err if closeOnErr(err)

				ch.on "error", (err) ->
					console.error "[AMQP] channel error", err.message

				ch.on "close", () ->
					console.log "[AMQP] channel closed"

				channelPool[name] = ch if pool
				done null, ch

	_initBinding = (channel, queue, exchange, done) ->
		channel.assertExchange exchange, exchangeParams.type, exchangeParams, (err, ok) ->
			return done err if closeOnErr(err)

			channel.assertQueue queue, queueParams, (err, ok) ->
				return done err if closeOnErr(err)

				channel.bindQueue queue, exchange, defaultRoutingKey, {}, done

	publish: (exchange, message, done) ->
		getChannel 'publish', 'createConfirmChannel', true, (err, ch) ->
			return done err if closeOnErr(err)

			message = new Buffer JSON.stringify message
			ch.publish exchange, defaultRoutingKey, message, messageParams, (err, ok) ->
				if err
					console.error "[AMQP] publish", err
					return done err if closeOnErr(err)

				done()

	subscribe: (queue, done) ->
		getChannel getSubscribeChannelName(queue), 'createChannel', true, (err, ch) ->
			return done err if closeOnErr(err)

			ch.prefetch(1)
			ch.assertQueue queue, queueParams, (err, _ok) ->
				return done err if closeOnErr(err)
				ch.consume queue, processMsg, { noAck: false }
				console.log "Subscriber for queue '#{queue}' is started"

			processMsg = (msg) -> done null, msg

	getMessageData: (message) -> JSON.parse message.content.toString()

	messagesCount: (queue, done) ->
		getChannel "etc", 'createChannel', true, (err, ch) ->
			ch.assertQueue queue, queueParams, (err, res) ->
				return done err if closeOnErr(err)
				done null, res.messageCount

	ack: (queue, message) ->
		getChannel getSubscribeChannelName(queue), 'createChannel', true, (err, ch) -> ch.ack message

	nack: (queue, message) ->
		getChannel getSubscribeChannelName(queue), 'createChannel', true, (err, ch) -> ch.reject message, true

	initBindings: (done) ->
		getChannel "init_bindings", 'createChannel', false, (err, ch) =>
			return done err if closeOnErr(err)

			async.eachSeries Object.keys(config.bindings), (binding, cb) =>
				_initBinding ch, config.bindings[binding].queue, config.bindings[binding].exchange, cb
			, (err) ->
				return done err if err
				ch.close done