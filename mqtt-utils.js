require('dotenv').config();

const mqtt = require('mqtt');

// Verbindung zum MQTT-Broker
const mqttClient = mqtt.connect(process.env.MQTT_BROKER, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  clientId: "adebar_" + Math.random().toString(16).substr(2, 8),
  clean: true, // Saubere Sitzung
});


function mqttSend(topic, value) {
  mqttClient.publish(topic, value);
}

// === MQTT Discovery Konfiguration ===
function mqttSendConfig(device_name, device_key, name, device_class, key, unit, state_class) {
  const data_config = {
    name,
    device_class,
    state_topic: `${device_key}/${key}/state`,
    unit_of_measurement: unit,
    unique_id: `${device_key}_${key}`,
    state_class, // measurement oder total_increasing
    device: {
      identifiers: [device_key],
      name: device_name,
    }
  };
  mqttSend(`homeassistant/sensor/${device_key}_${key}/config`, JSON.stringify(data_config));
}

// Exportiere die Funktionen
module.exports = { mqttClient, mqttSend, mqttSendConfig };