const { mqttClient, mqttSend, mqttSendConfig } = require('./mqtt-utils');

const tasmotaTopic = 'tele/tasmota_energymeter/SENSOR';

function mqttSendConfigs() {
  // Momentanwerte
  mqttSendConfig("Energymeter", "energymeter", "Energymeter Power Current", "power", "power_curr", "W", "measurement");
  mqttSendConfig("Energymeter", "energymeter", "Energymeter Power L1", "power", "power_l1_curr", "W", "measurement");
  mqttSendConfig("Energymeter", "energymeter", "Energymeter Power L2", "power", "power_l2_curr", "W", "measurement");
  mqttSendConfig("Energymeter", "energymeter", "Energymeter Power L3", "power", "power_l3_curr", "W", "measurement");
  // Zählerstände
  mqttSendConfig("Energymeter", "energymeter", "Energymeter Power Total In", "energy", "power_total_in", "kWh", "total_increasing");
  mqttSendConfig("Energymeter", "energymeter", "Energymeter Power Total Out", "energy", "power_total_out", "kWh", "total_increasing");
}


// Verbindung herstellen
mqttClient.on('connect', () => {
  console.log('mqtt connected');
  mqttClient.subscribe(tasmotaTopic, (err) => {
    if (err) console.error('error while subscribe:', err);
  });

  mqttSendConfigs();
});


mqttClient.on('message', (topic, payload) => {
  try {
    const msg = JSON.parse(payload.toString());
    const d = msg?.LK13BE;

    mqttSend(`energymeter/power_curr/state`, d.Power_curr.toString());
    mqttSend(`energymeter/power_l1_curr/state`, d.Power_L1_curr.toString());
    mqttSend(`energymeter/power_l2_curr/state`, d.Power_L2_curr.toString());
    mqttSend(`energymeter/power_l3_curr/state`, d.Power_L3_curr.toString());
    mqttSend(`energymeter/power_total_in/state`, d.Power_total_in.toString());
    mqttSend(`energymeter/power_total_out/state`, d.Power_total_out.toString());
  } catch (e) {
    console.error('error while parsing payload:', e);
  }
});

mqttClient.on('error', (err) => {
  mqttClient.error('mqtt error:', err);
});

setInterval(() => {
  mqttSendConfigs();
}, 60 * 1000 * 5); // Every 5 minutes
