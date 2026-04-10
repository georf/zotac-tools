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

POLL_INTERVAL = 60  # 1 Minute

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
    "pv_today": {
        "register": HoldingRegisters.TodayFromPV,
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "pv_total": {
        "register": HoldingRegisters.TotalFromPV,
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "battery_charge_today": {
        "register": HoldingRegisters.BatteryChargeToday,
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "battery_charge_total": {
        "register": HoldingRegisters.BatteryChargeTotal,
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "battery_discharge_today": {
        "register": HoldingRegisters.BatteryDischargeToday,
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "battery_discharge_total": {
        "register": HoldingRegisters.BatteryDischargeTotal,
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "pv1_power": {
        "register": HoldingRegisters.PV1InPower,
        "unit": "W",
        "device_class": "power",
        "state_class": "measurement",
        "last_value": None,
    },
    "pv2_power": {
        "register": HoldingRegisters.PV2InPower,
        "unit": "W",
        "device_class": "power",
        "state_class": "measurement",
        "last_value": None,
    },
    "pv_power": {
        "sum": ["pv1_power", "pv2_power"],
        "unit": "W",
        "device_class": "power",
        "state_class": "measurement",
    },
}

# ======================
# Home Assistant Discovery
# ======================
def publish_discovery():
    for key, cfg in REGISTERS.items():
        payload = {
            "name": f"Deye12K {key}",
            "device_class": cfg["device_class"],
            "state_topic": f"deye12k/{key}/state",
            "unit_of_measurement": cfg["unit"],
            "unique_id": f"deye12k_{key}",
            "state_class": cfg["state_class"],
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
        for key, cfg in REGISTERS.items():
            value = None
            if "sum" in cfg:
                if any(REGISTERS[sub_key]["last_value"] is None for sub_key in cfg["sum"]):
                    continue
                value = sum(REGISTERS[sub_key]["last_value"] for sub_key in cfg["sum"])
                cfg["last_value"] = value
            else:
              value = read_register(cfg["register"])
              cfg["last_value"] = value
            
            # Debug output
            print(f"Publishing {key} to topic deye12k/{key}/state with value: {value}")

            mqtt_client.publish(f"deye12k/{key}/state", value)
            time.sleep(1)  # Kurze Pause zwischen den Veröffentlichungen

        mqtt_client.loop()

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()