// Watchmon UDP Listener for your Batrium BMS system
//
// Created by daromer aka DIY Tech and Repairs
// http://diytechandrepairs.nu
// https://www.youtube.com/user/daromeresperyd
//
// MIT Licensed
// creating a udp server

// forked by georf

var udp = require("dgram");
var server = udp.createSocket("udp4");
var Parser = require("binary-parser").Parser;
var fs = require("fs");


const { mqttClient, mqttSend, mqttSendConfig } = require('./mqtt-utils');

// Verbindung herstellen
mqttClient.on('connect', () => {
  console.log('mqtt connected');

  mqttSendConfigs();
});

function mqttSendConfigs() {
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Lowest cell voltage", "voltage", "cell_voltage_lowest", "V", "measurement");
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Highest cell voltage", "voltage", "cell_voltage_highest", "V", "measurement");
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Lowest cell temp", "temperature", "cell_temp_lowest", "°C", "measurement");
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Highest cell temp", "temperature", "cell_temp_highest", "°C", "measurement");

  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Voltage", "voltage", "battery_voltage", "V", "measurement");
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Current", "current", "battery_current", "A", "measurement");
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery SoC", "battery", "battery_soc", "%", "measurement");
  mqttSendConfig("Deye12K", "deye12k", "Deye12K-Battery Power", "power", "battery_power", "W", "measurement");
}


var debug = true;

// Function to get payload data
// input data object
// output payload data in json form
const payloadParser = new Parser()
  .string("first", { encoding: "utf8", length: 1 })
  .int16le("MessageId", {
    formatter: (x) => {
      return x.toString(16);
    },
  })
  .string("nd", { encoding: "utf8", length: 1 })
  .int16le("SystemId")
  .int16le("hubId");
function getPayload(data) {
  return payloadParser.parse(data);
}

function errorText(string) {
  console.log("\x1b[31m%s\x1b[0m", string);
}
function infoText(string) {
  console.log("\x1b[32m%s\x1b[0m", string);
}
function runText(string) {
  console.log("\x1b[34m%s\x1b[0m", string);
}

class MovingAverage {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.queue = [];
    this.sum = 0;
  }

  add(value) {
    this.queue.push(value);
    this.sum += value;

    if (this.queue.length > this.maxSize) {
      this.sum -= this.queue.shift(); // Ältesten Wert entfernen
    }
  }

  getAverage() {
    if (this.queue.length === 0) return 0;
    return this.sum / this.queue.length;
  }
}

class SensorTracker {
  constructor() {
    this.sensors = new Map();
  }

  add(sensorId, value) {
      this.sensors.set(sensorId, value);
  }

  getMin() {
    return Math.min(...this.sensors.values());
  }

  getMax() {
    return Math.max(...this.sensors.values());
  }
}

var cellTemp = new SensorTracker();
var cellVolt = new SensorTracker();
var averageShuntVoltage = new MovingAverage(30);
var averageShuntCurrent = new MovingAverage(30);
var averageShuntPowerVA = new MovingAverage(30);
var averageShuntSOC = new MovingAverage(30);

setInterval(mqttSendConfigs, 60*5*1000); // alle 5 Minuten

setInterval(() => {
  console.log("cellTemp", cellTemp.getMin(), cellTemp.getMax());  
  mqttSend("deye12k/cell_temp_lowest/state", cellTemp.getMin().toFixed());
  mqttSend("deye12k/cell_temp_highest/state", cellTemp.getMax().toFixed());
  
  console.log("cellVolt", cellVolt.getMin(), cellVolt.getMax());  
  mqttSend("deye12k/cell_voltage_lowest/state", cellVolt.getMin().toFixed(2));
  mqttSend("deye12k/cell_voltage_highest/state", cellVolt.getMax().toFixed(2));

  console.log("averageShuntVoltage", averageShuntVoltage.getAverage());
  mqttSend("deye12k/battery_voltage/state", averageShuntVoltage.getAverage().toFixed(2));
  console.log("averageShuntCurrent", averageShuntCurrent.getAverage());
  mqttSend("deye12k/battery_current/state", averageShuntCurrent.getAverage().toFixed(2));
  console.log("averageShuntPowerVA", averageShuntPowerVA.getAverage());
  mqttSend("deye12k/battery_power/state", (averageShuntPowerVA.getAverage() * -1000).toFixed());
  console.log("averageShuntSOC", averageShuntSOC.getAverage());
  mqttSend("deye12k/battery_soc/state", averageShuntSOC.getAverage().toFixed(1));
}, 30*1000); // alle 30 Sekunden

// emits when any error occurs
server.on("error", function (error) {
  console.log("Error: " + error);
  server.close();
});

var normalizedPath = require("path").join(__dirname, "payload");
console.log("Batrium logger started");

// Function to load in all parsers from the payload folder. Those not able to load will be discarded during startup.
var messages = {};
require("fs")
  .readdirSync(normalizedPath)
  .forEach(function (file) {
    try {
      load = file.split("_")[1];
      messages[load.toLowerCase()] = require("./payload/" + file);
      infoText("Loaded file: " + file);
    } catch (e) {
      errorText("Could not load file: " + file);
      console.error(e);
    }
  });


// Time to process incomming data
var tag;
// Parse new messages incomming from Batrium
server.on("message", function (msg, info) {
  let payload = getPayload(msg);
  //process.stdout.write("\x1b[34mData recieved from\x1b[0m " + payload.SystemId  + " \x1b[34mand message is:\x1b[0m " + payload.MessageId + " \r");
  let obj;
  // If error in message lets try/catch it so we dont rage quit

  try {
    if (payload.MessageId == '415a') {
      obj = Object.assign(payload, messages[payload.MessageId](msg));
      obj.nodes.forEach( (node) => {
        cellTemp.add(node.ID, node.MinCellTemp);
        cellVolt.add(node.ID, node.MaxCellVolt);
      });
    } else if (payload.MessageId == '3f34') {
      obj = Object.assign(payload, messages[payload.MessageId](msg));
      averageShuntVoltage.add(obj.ShuntVoltage);
      averageShuntCurrent.add(obj.ShuntCurrent);
      averageShuntPowerVA.add(obj.ShuntPowerVA);
      averageShuntSOC.add(obj.ShuntSOC);
    } else {
     if (false) {
       if (payload.MessageId in messages) {
         obj = Object.assign(payload, messages[payload.MessageId](msg));
         console.log(obj);
       } else {
         console.log('Message with message id %s does not exist', payload.MessageId);
       }
     }
    }
  } catch (e) {
    errorText(
      "Couldnt get payload for " + payload.MessageId + " Size: %s",
      msg.length,
    );
    console.log(e);
    //process.exit(1);  //Lets end the program if we find errors processing the data. for error searching
   }
});

//emits when socket is ready and listening for datagram msgs
server.on("listening", function () {
  var address = server.address();
  var port = address.port;
  var family = address.family;
  var ipaddr = address.address;
  console.log("Batrium logger Server is listening at port" + port);
});

//emits after the socket is closed using socket.close();
server.on("close", function () {
  console.log("Socket is closed !");
});

// Extra debugging added
process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
  // application specific logging, throwing an error, or other logic here
});

server.bind(18542);
