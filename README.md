knode-rabbitmq
==============

is a node module wrapper on `amqplib/callback_api`. It is based on information in this useful article:

https://www.cloudamqp.com/docs/nodejs.html

it also implements channel pooling.

# Install:

```
npm install --save knode-rabbitmq
```

# Usage:

## Config sample

```
rabbitmq:
	connection: "amqp://#{process.env.RABBITMQ_LOGIN}:#{process.env.RABBITMQ_PASSWORD}@#{process.env.RABBITMQ_HOST}:#{process.env.RABBITMQ_PORT}"
	bindings:
		test:
			queue: 'test_q'
			exchange: 'test_exc'
		test22:
			queue: 'test22_q'
			exchange: 'test22_exc'
```

bindings are used by name, in this case they are `test` and `test22`

## Sample subscriber code

```javascript
var rmq = require('knode-rabbitmq')(process.config.rabbitmq);
var queue = process.config.rabbitmq.bindings.test.queue;

rmq.subscribe(queue, function(err, msg) {
  if (err) {
    console.log("ERROR: " + err);
    process.exit(1);
  }

  var data = rmq.getMessageData(msg); //extract message content
  console.log(data);
  rmq.ack(queue, msg); //ACK message
});
```

## Sample subscriber code with bindings init

```javascript
var rmq = require('knode-rabbitmq')(process.config.rabbitmq);

rmq.initBindings(function(err, res) {
  if (err) {
    console.log("ERROR: " + err);
    process.exit(1);
  }

  var queue = process.config.rabbitmq.bindings.test.queue;
  return rmq.subscribe(queue, function(err, msg) {
    if (err) {
      console.log("ERROR: " + err);
      process.exit(1);
    }

    var data = rmq.getMessageData(msg); //extract message content
    console.log(data);
    rmq.ack(queue, msg); //ACK message
  });
});
```

## Sample get queue messages count

```javascript
var rmq = require('knode-rabbitmq')(process.config.rabbitmq);

rmq.messagesCount(process.config.rabbitmq.bindings.test.queue, function(err, res) {
  if (err) {
    console.log("ERROR: " + err);
    process.exit(1);
  }

  console.log(res); //will return number - count of messages in specified queue
});
```

## Sample publish message code

```javascript
var rmq = require('knode-rabbitmq')(process.config.rabbitmq);

rmq.publish(process.config.rabbitmq.bindings.test.exchange, {
  data: [1, 2, 3]
}, function(err, res) {
  if (err) {
    console.log("ERROR: " + err);
    process.exit(1);
  }

  console.log("done");
});
```

# Links:

* [useful article on node AMQP](https://www.cloudamqp.com/docs/nodejs.html)
* [amqplib documentation](http://www.squaremobius.net/amqp.node/channel_api.html)
* [amqplib NPM link](https://www.npmjs.com/package/amqplib)
* [AMQP protocol explained](https://www.rabbitmq.com/tutorials/amqp-concepts.html)