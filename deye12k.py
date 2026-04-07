import time
import json
import paho.mqtt.client as mqtt

from deye_controller import HoldingRegisters
from pysolarmanv5 import PySolarmanV5

from dotenv import load_dotenv
import os

load_dotenv()

# ======================
# CONFIG
# ======================
INVERTER_IP = os.getenv("INVERTER_IP")
INVERTER_SERIAL = int(os.getenv("INVERTER_SERIAL"))

MQTT_HOST = os.getenv("MQTT_HOST")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASSWORD = os.getenv("MQTT_PASS")

POLL_INTERVAL = 600  # 10 Minuten

# ======================
# MQTT
# ======================
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)

# ======================
# Inverter
# ======================
inv = PySolarmanV5(INVERTER_IP, INVERTER_SERIAL)

# ======================
# Registers
# ======================
REGISTERS = {
    "pv_today": HoldingRegisters.TodayFromPV,
    "pv_total": HoldingRegisters.TotalFromPV,
    "battery_charge_today": HoldingRegisters.BatteryChargeToday,
    "battery_charge_total": HoldingRegisters.BatteryChargeTotal,
    "battery_discharge_today": HoldingRegisters.BatteryDischargeToday,
    "battery_discharge_total": HoldingRegisters.BatteryDischargeTotal,
}

# ======================
# Home Assistant Discovery
# ======================
def publish_discovery():
    for key in REGISTERS:
        payload = {
            "name": f"Deye12K {key}",
            "device_class": "energy",
            "state_topic": f"deye12k/{key}/state",
            "unit_of_measurement": "kWh",
            "unique_id": f"deye12k_{key}",
            "state_class": "total_increasing",
            "device": {
              "identifiers": [
                "deye12k"
              ],
              "name": "Deye12K",
            }
        }

        topic = f"homeassistant/sensor/deye12k_{key}/config"
        # Debug output
        print(f"Publishing discovery for {key} to topic {topic} with payload: {json.dumps(payload)}")

        mqtt_client.publish(topic, json.dumps(payload))

# ======================
# Read Register
# ======================
def read_register(register):
    res = inv.read_holding_registers(register.address, register.len)
    register.value = res[0] if register.len == 1 else res
    return register.format()

# ======================
# Main Loop
# ======================
def main():
    publish_discovery()

    while True:
        inv = PySolarmanV5(INVERTER_IP, INVERTER_SERIAL)
        for key, register in REGISTERS.items():
            value = read_register(register)
            
            # Debug output
            print(f"Publishing {key} to topic deye12k/{key}/state with value: {value}")

            mqtt_client.publish(f"deye12k/{key}/state", value)
            time.sleep(1)  # Kurze Pause zwischen den Veröffentlichungen

        mqtt_client.loop()

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()