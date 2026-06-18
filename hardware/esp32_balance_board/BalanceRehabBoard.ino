// BalanceRehab ESP32 ultrasonic board
// USB serial protocol: one clean JSON object per line at 115200 baud.
//
// This sketch matches the 4-direction sensor wiring:
// front, rear, left, right.
//
// Example:
// {"t":1234,"front":12.4,"rear":13.0,"left":12.8,"right":12.1,"status":"ok","quality":{"front":"ok","rear":"ok","left":"ok","right":"ok"}}

#define SOUND_SPEED 0.0343

// Front
#define TRIG_FRONT 5
#define ECHO_FRONT 18

// Rear
#define TRIG_REAR 17
#define ECHO_REAR 16

// Left
#define TRIG_LEFT 19
#define ECHO_LEFT 21

// Right
#define TRIG_RIGHT 23
#define ECHO_RIGHT 22

const uint32_t SERIAL_BAUD = 115200;
const uint16_t SAMPLE_INTERVAL_MS = 100;  // 10 Hz, stable for serial + ultrasonic timing
const uint32_t ECHO_TIMEOUT_US = 30000;
const float MIN_DISTANCE_CM = 2.0f;
const float MAX_DISTANCE_CM = 250.0f;
const float EMA_ALPHA = 0.28f;

struct Sensor {
  const char* key;
  uint8_t trigPin;
  uint8_t echoPin;
  float filteredCm;
  bool hasFiltered;
  bool ok;
};

Sensor sensors[] = {
  {"front", TRIG_FRONT, ECHO_FRONT, 0.0f, false, false},
  {"rear", TRIG_REAR, ECHO_REAR, 0.0f, false, false},
  {"left", TRIG_LEFT, ECHO_LEFT, 0.0f, false, false},
  {"right", TRIG_RIGHT, ECHO_RIGHT, 0.0f, false, false},
};

constexpr size_t SENSOR_COUNT = sizeof(sensors) / sizeof(sensors[0]);
unsigned long lastSampleMs = 0;

float readDistance(int trigPin, int echoPin);
void writeJsonPacket(unsigned long timestampMs, const float* values, bool allOk);

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);

  for (size_t i = 0; i < SENSOR_COUNT; i++) {
    pinMode(sensors[i].trigPin, OUTPUT);
    pinMode(sensors[i].echoPin, INPUT);
    digitalWrite(sensors[i].trigPin, LOW);
  }
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleMs < SAMPLE_INTERVAL_MS) {
    return;
  }
  lastSampleMs = now;

  float values[SENSOR_COUNT];
  bool allOk = true;
  for (size_t i = 0; i < SENSOR_COUNT; i++) {
    float reading = readDistance(sensors[i].trigPin, sensors[i].echoPin);
    bool ok = reading >= MIN_DISTANCE_CM && reading <= MAX_DISTANCE_CM;
    sensors[i].ok = ok;
    if (!ok) {
      allOk = false;
      values[i] = -1.0f;
    } else {
      if (!sensors[i].hasFiltered) {
        sensors[i].filteredCm = reading;
        sensors[i].hasFiltered = true;
      } else {
        sensors[i].filteredCm = sensors[i].filteredCm * (1.0f - EMA_ALPHA) + reading * EMA_ALPHA;
      }
      values[i] = sensors[i].filteredCm;
    }
    delay(50);
  }

  writeJsonPacket(now, values, allOk);
}

float readDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) return -1.0f;

  return duration * SOUND_SPEED / 2.0f;
}

void writeJsonPacket(unsigned long timestampMs, const float* values, bool allOk) {
  Serial.print("{\"t\":");
  Serial.print(timestampMs);

  for (size_t i = 0; i < SENSOR_COUNT; i++) {
    Serial.print(",\"");
    Serial.print(sensors[i].key);
    Serial.print("\":");
    if (sensors[i].ok) {
      Serial.print(values[i], 3);
    } else {
      Serial.print("null");
    }
  }

  Serial.print(",\"status\":\"");
  Serial.print(allOk ? "ok" : "sensor_warning");
  Serial.print("\",\"quality\":{");
  for (size_t i = 0; i < SENSOR_COUNT; i++) {
    if (i > 0) Serial.print(",");
    Serial.print("\"");
    Serial.print(sensors[i].key);
    Serial.print("\":\"");
    Serial.print(sensors[i].ok ? "ok" : "out_of_range");
    Serial.print("\"");
  }

  if (!allOk) {
    Serial.print("},\"errors\":{");
    bool first = true;
    for (size_t i = 0; i < SENSOR_COUNT; i++) {
      if (sensors[i].ok) continue;
      if (!first) Serial.print(",");
      first = false;
      Serial.print("\"");
      Serial.print(sensors[i].key);
      Serial.print("\":-1");
    }
    Serial.println("}}");
  } else {
    Serial.println("}}");
  }
}
