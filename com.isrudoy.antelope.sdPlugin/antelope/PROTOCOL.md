# Antelope Audio Zen Quadro Synergy Core — Protocol Reverse Engineering

> **Disclaimer:** Этот документ — результат реверс-инжиниринга закрытого протокола. Официальной документации не существует. Данные получены из анализа TCP-трафика, декомпиляции Control Panel (Python/PyQt5), логов Manager Server и экспериментов с CLI-клиентом. Возможны неточности, неполные сведения и устаревшая информация (особенно после обновлений прошивки или ПО). Если что-то не работает как описано — скорее всего, нужно перепроверить конкретный аспект и обновить этот документ.

---

## Версии ПО

| Компонент | Версия | Путь |
|-----------|--------|------|
| Manager Server | 1.8.20 | `/Users/Shared/.AntelopeAudio/managerserver/servers/1.8.20/` |
| Control Panel | 1.0.4 | `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/1.0.4/` |
| Protocol Schema | v20 | `report_format_1.0.4` (209 команд) |
| Device ID | 4913625000181 | Zen Quadro Synergy Core USB2 |

---

## Архитектура

```
┌─────────────────┐     TCP localhost     ┌─────────────────┐      USB       ┌──────────────┐
│  Control Panel  │ ◄──────────────────► │  Manager Server  │ ◄────────────► │  Zen Quadro  │
│  (or CLI/plugin)│   ports 2020-2030    │   (root daemon)  │                │   Hardware   │
└─────────────────┘                       └─────────────────┘                └──────────────┘
```

### Три порта (динамические, в диапазоне 2020-2030)

Manager Server слушает на **трёх** TCP-портах. Номера портов динамические, но обычно:

| Типичный порт | Роль | Содержимое |
|---------------|------|------------|
| 2020 | Status/discovery | Read-only. Периодический status (~500ms): версия сервера, подключённые устройства, кол-во клиентов |
| 2021 | Status notifications | `type: "notification"` со строковым `contents` (текст статуса). Также `type: "cyclic"` но **без `volumes`** — это НЕ основной порт |
| **2022** | **Основной протокол** | **Cyclic reports (~500ms) с полным состоянием + команды + notifications. Это порт для работы** |

**Критично**: Порт 2021 отправляет `type: "cyclic"` сообщения, но в них нет `contents.volumes` — это ложное совпадение. CP открывает ~28 соединений к порту 2022.

### Автоопределение порта

Сканируем порты 2020-2030, на каждом ждём первый пакет. Правильный порт определяется по:
```javascript
msg.type === 'cyclic' && msg.contents?.volumes  // ОБЯЗАТЕЛЬНО проверять volumes
```

Таймаут на порт: 500ms connect + 1500ms ожидание данных.

---

## Wire Protocol (TCP)

**Главное открытие:** протокол между Control Panel и Manager Server — **JSON по TCP**, не бинарный!

### Формат пакета

```
┌──────────────────┬─────────────────────────────────┐
│ 4 bytes (BE)     │ JSON payload                    │
│ total length     │                                 │
└──────────────────┴─────────────────────────────────┘
```

**Важно:** длина в заголовке — это **полная длина пакета** (включая 4 байта заголовка).

### Отправка пакета

Header и payload отправляются одним write через `Buffer.concat`:
```javascript
const payload = JSON.stringify(["command", args, kwargs]);
const payloadBuf = Buffer.from(payload, 'utf8');
const header = Buffer.alloc(4);
header.writeUInt32BE(4 + payloadBuf.length, 0);
socket.write(Buffer.concat([header, payloadBuf]));  // single write
```

### Request (Client → Server)

JSON массив: `["command", [positional_args], {kwargs}]`

**Примеры:**
```json
["set_volume", [0, 47], {}]
["set_mute", [0, 1], {}]
["set_dim", [0, 1], {}]
["set_pre_gain", [2, 10], {"sender": "unique"}]
["set_mixer", [0, 5], {"sender": 5, "level": 12, "pan": 62, "mute": false, "solo": 0}]
["set_afx_bypass", [0, 1, true], {}]
["preset_recall", [2], {}]
["get_mixer", [], {"ext3": 0}]
["get_routing", [], {"ext3": 8}]
```

### Response Types (Server → Client)

#### Cyclic Report (`type: "cyclic"`, каждые ~500ms)

Содержит полное состояние устройства:
```json
{
  "type": "cyclic",
  "protocol_version": 1,
  "header": {"cmd": 131, "seq": 28, "ext2": 0, "ext3": 0},
  "contents": {
    "current_preset": 0,
    "power_on": 1,
    "sync_source": 0,
    "sync_freq_hi": 0,
    "sync_freq_mid": 172,
    "sync_freq_low": 68,
    "device_updated": 0,
    "volumes": [
      {"volume": 46, "mute": 0, "dim_on": 0, "mono": 0, "trim": 0},
      {"volume": 19, "mute": 0, "dim_on": 0, "mono": 0, "trim": 0},
      {"volume": 96, "mute": 1, "dim_on": 0, "mono": 0, "trim": 0},
      {"volume": 96, "mute": 1, "dim_on": 0, "mono": 0, "trim": 0}
    ],
    "preamp_gains": [-10, -10, 10, -10],
    "preamps": [
      {"type": 0, "phantom": 0, "hpf": 0, "phase_inv": 0, "zero_cross": 0},
      {"type": 1, "phantom": 0, "hpf": 0, "phase_inv": 0, "zero_cross": 0},
      {"type": 1, "phantom": 0, "hpf": 0, "phase_inv": 0, "zero_cross": 0},
      {"type": 1, "phantom": 0, "hpf": 0, "phase_inv": 0, "zero_cross": 0}
    ],
    "peaks_preamp": [0, 0, 96, 0],
    "..."
  }
}
```

**Sample rate** кодируется тремя байтами:
```javascript
const sampleRate = (contents.sync_freq_hi << 16) + (contents.sync_freq_mid << 8) + contents.sync_freq_low;
// Пример: 0, 172, 68 → 44100
```

#### Notification (`type: "notification"`)

Рассылается ВСЕМ подключённым клиентам когда любой клиент меняет параметр:
```json
{
  "type": "notification",
  "protocol_version": 1,
  "contents": ["set_mixer", [0, 1], {"sender": 1, "level": 32, "pan": 32, "mute": 0, "solo": 0}]
}
```

#### Single Response (`type: "single"`)

Ответ на конкретную команду (get_mixer, get_routing):
```json
{
  "type": "single",
  "header": {"cmd": 117, "seq": 5, "ext2": 4, "ext3": 0},
  "contents": [...]
}
```

Тип ответа определяется полем `header.ext2`:
- `ext2 === 4` — ответ на `get_mixer` (contents = массив каналов)
- `ext2 === 3` — ответ на `get_routing` (contents = `{bank_configs: [...]}`)

#### Server Status (на порту 2020/2021)

```json
{
  "type": "notification",
  "contents": "Server ver. 1.8.20 running on 127.0.0.1 port 2024\n\nPlugged devices:\nZen Quadro SC with SN:4913625000181\n...",
  "state": "running"
}
```

---

## initialize_format

При подключении CP отправляет:
```json
["initialize_format", [<report_format_object>], {}]
```

Где `<report_format_object>` — содержимое файла:
```
/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/report_format_1.0.4
```

Это ~70KB JSON со структурой:
```json
{
  "authorative": true,
  "version": 20,
  "cyclic_reports": { ... },
  "requests": { ... }
}
```

Файл содержит определения для **всех 209 команд**: типы полей, размеры, значения заголовков, и флаг `auto_send_notification`.

### auto_send_notification

Некоторые команды имеют флаг `"auto_send_notification": true` — сервер автоматически рассылает notification всем клиентам после применения команды. Это есть у:
- `set_mixer`
- `set_afx_bypass`
- и других

Пример записи для `set_mixer`:
```json
{
  "header": {"report_id": "0x70", "ext2": 0, "ext3": 0},
  "params": {
    "payload_id": 20,
    "fields": [
      ["mixer_id", "ubyte"],
      ["channel", "ubyte"],
      ["level", "ubyte"],
      ["pan", "ubyte", 6],
      ["mute", "ubyte", 1],
      ["solo", "ubyte", 1]
    ]
  },
  "auto_send_notification": true
}
```

---

## Устройство: Zen Quadro SC

### Выходы (4-6 штук, зависит от конфигурации)

| ID | Название | Описание |
|----|----------|----------|
| 0 | Monitor | Главный мониторный выход |
| 1 | HP1 | Наушники 1 |
| 2 | HP2 | Наушники 2 |
| 3 | Line Out | Линейный выход |
| 4 | Out 4 | Доп. выход |
| 5 | Out 5 | Доп. выход |

Каждый выход:
- `volume` (0-255) — громкость
- `mute` (0/1)
- `dim_on` (0/1) — dim (-20dB)
- `mono` (0/1) — моно суммирование
- `trim` (0-31) — trim

### Преампы (4 штуки)

- `gain` (-10..65 dB)
- `phantom` (0/1) — 48V фантомное питание
- `phase_inv` (0/1) — инверсия фазы
- `hpf` (0/1) — high-pass filter
- `type` (0=MIC, 1=LINE) — тип входа

### Микшер

- **3 шины** (Bus 0-2): Monitor/HP1, Headphones 2, Line Out
- Каждая шина содержит набор каналов (обычно 17+ — ch0 системный, ch1+ рабочие)
- Каждый канал: `level` (0-90, 96+=−∞), `pan` (0-63, 0=L 32=C 63=R), `mute` (0/1), `solo` (0/1)
- **Протокол требует ВСЕ параметры** в kwargs: `{sender, level, pan, mute, solo}`

### Пресеты (Device Presets)

8 аппаратных слотов (ID 0-7). Хранятся в прошивке устройства. **Безымянные** — только номера 1-8.

- `current_preset` в cyclic report — текущий активный пресет
- `preset_save` / `preset_recall` — сохранение/загрузка

### Сессии (Sessions)

`.as` файлы на диске — полные JSON-снапшоты состояния устройства (routing, mixer, AFX, имена каналов). CP работает с ними через файловую систему, **не через протокол**.

| Файл | Описание |
|------|----------|
| `recent_sessions` | Список последних 4 путей к `.as` файлам |
| `preferences.json` | `SESSION_PRESET0`..`SESSION_PRESET4` — привязки сессий к слотам (обычно `null`) |

Кнопки SAVE/LOAD в CP — файловый диалог для сессий, не связан с командами `preset_save`/`preset_recall`.

### Peripheral IDs (из get_routing)

| ID | Имя | Описание | Каналов |
|----|-----|----------|---------|
| 0 | PRE | PREAMP | 4 |
| 1 | USB1 | USB 1 PLAY | 16 |
| 2 | USB2 | USB 2 PLAY | 2 |
| 3 | ADAT | ADAT IN | 8 |
| 4 | SPDIF | SPDIF IN | 2 |
| 5 | AFX | AFX OUT | 6 |
| 6 | LP-HP1 | LOOPBACK HP1 | 2 |
| 7 | LP-HP2 | LOOPBACK HP2 | 2 |
| 8 | MIX3 | MIXER_OUT2 | 2 |
| 9 | MIX4 | MIXER_OUT3 | 2 |
| 10 | MUTE | Silence | — |
| 11 | OSC | Oscillator | 2 |
| 12 | EMU | Emulated mic | 4 |

---

## Routing (маршрутизация)

### Routing Banks

| ext3 | Назначение |
|------|------------|
| 0-6 | Выходные банки |
| 7 | AFX input bank — входы AFX стрипов |
| 8 | Mixer bus 0 inputs |
| 9 | Mixer bus 1 inputs |
| 10 | Mixer bus 2 inputs |
| 11 | Mixer bus 3 inputs |
| 12 | Доп. банк |

### get_routing ответ

```json
{
  "type": "single",
  "header": {"cmd": 117, "seq": 5, "ext2": 3, "ext3": 8},
  "contents": {
    "bank_configs": [
      {"in_periph_id": 0, "in_chann": 0},
      {"in_periph_id": 0, "in_chann": 1},
      {"in_periph_id": 5, "in_chann": 2},
      ...
    ]
  }
}
```

### AFX Tracing

Канал 0 в микшере — системный, реальные каналы начинаются с 1. Routing сдвинут на 1 (routing index для ch1 = 0).

Если source = AFX OUT (periph=5), нужно **проследить через AFX input bank** (ext3=7) к реальному источнику:

```javascript
// Пример: mixer bus 0, channel 5
// routing[8][4] = {periph: 5, ch: 2}  // AFX OUT ch 2
// routing[7][2] = {periph: 0, ch: 1}  // → PRE ch 1 (реальный источник)
```

### Имена каналов из persistence.JSON

Файл `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/persistence.JSON` содержит пользовательские имена каналов:

```json
{
  "TMP_ROUTING": {
    "routing_matrix": [
      {
        "group_name": "PREAMP",
        "channels": [
          {"uniqueid": "PREAMP0CH1", "name": "Mic 1"},
          {"uniqueid": "PREAMP0CH2", "name": "Guitar"},
          ...
        ]
      },
      ...
    ]
  }
}
```

Маппинг `group_name` → `periph_id`:
```
PREAMP→0, USB 1 PLAY→1, USB 2 PLAY→2, ADAT IN→3, SPDIF IN→4,
AFX OUT→5, LOOPBACK HP1→6, LOOPBACK HP2→7, MIXER_OUT2→8,
MIXER_OUT3→9, MUTE→10, OSCILLATOR→11, EMU MIC→12
```

---

## device_updated Mechanism

Поле `device_updated` в cyclic report:

- Обычно `0`
- Устанавливается в `1` когда **аппаратные** элементы (энкодер, меню устройства) меняют состояние
- Остаётся `1` примерно **~3.5 секунды** подряд (несколько cyclic reports)
- CP отслеживает переход 0→1 (edge detection) и запрашивает:
  - `get_mixer` для всех шин
  - `get_mixer_links`
  - `get_afx_strip_order`

**Обязательно** использовать edge detection (отслеживать предыдущее состояние). Без него постоянный `1` вызывает бесконечный цикл перезапросов.

```javascript
let lastDeviceUpdated = false;
client.onCyclic = (contents) => {
  if (contents.device_updated && !lastDeviceUpdated) {
    lastDeviceUpdated = true;
    // Обновить состояние
    client.requestAllMixers();
    client.requestRouting();
  } else if (!contents.device_updated) {
    lastDeviceUpdated = false;
  }
};
```

---

## Control Panel — архитектура (PyInstaller)

### Стек

- **PyInstaller**-упакованное приложение Python 3.8 + PyQt5
- Панель устройства — **отдельный процесс** (`zenquadrosc_usb2.app`)
- Путь: `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/1.0.4/`

### Observer Pattern

```
RemoteDevice._read_loop()
  → handleMessage() — dispatch по msg.type
    → 'cyclic'       → on_cyclic_report() → notify_observers()
    → 'notification'  → on_notification()  → notify_observers()
    → 'single'        → on_response()
```

`notify_observers()` → `_observer_update()` — диспатчит в модели:
- `MixerDataModelController` — проверяет `set_mixer_cfg`
- `MixerModel` — `set_mixer_cmd = 'set_mixer'`, обработка notifications

### CP НЕ обновляет UI от внешних set_mixer

**Результат исследования:** CP получает наши set_mixer notifications (подтверждено в pcap), но **не обновляет визуально** mixer UI. Код обработки notifications в `MixerModel.on_notification` существует, но UI не обновляется от внешних источников.

Попытки заставить CP обновиться:
1. ❌ `sendAsNotification()` (обёртка в `send_notification`) — сервер не понимает
2. ❌ Inject fake cyclic с `device_updated=1` — сервер не ретранслирует произвольный JSON как cyclic
3. ❌ Inject на порт 2021 — CP на порту 2022, не видит
4. ❌ Inject на порт 2022 с полным форматом cyclic — не работает

**Вывод:** невозможно заставить CP обновиться после внешнего `set_mixer`. Принято как ограничение — наш плагин/CLI отслеживает состояние самостоятельно через cyclic reports и notifications.

---

## Полный список команд

### Команды выходов (Outputs)

```json
["set_volume", [outputId, volume], {}]       // volume 0-255
["set_mute", [outputId, 0|1], {}]
["set_dim", [outputId, 0|1], {}]
```

| payload_id | Команда | Поля |
|------------|---------|------|
| 0x07 | set_volume | id (ubyte), volume (ubyte) |
| 0x08 | set_mute | id (ubyte), mute (ubyte) |

### Команды преампов (Preamps)

```json
["set_pre_gain", [preampId, gain], {"sender": "unique"}]  // gain -10..65
["set_pre_phantom", [preampId, 0|1], {}]
["set_pre_phase_inv", [preampId, 0|1], {}]
["set_pre_type", [preampId, 0|1], {}]                     // 0=MIC, 1=LINE
```

| payload_id | Команда | Поля |
|------------|---------|------|
| 0x10 | set_pre_gain | id (ubyte), gain (byte) |
| 0x11 | set_pre_phantom | id (ubyte), phantom (ubyte) |

### Команды микшера (Mixer)

```json
// SET — требует ВСЕ параметры
["set_mixer", [busId, channelId], {"sender": channelId, "level": 32, "pan": 32, "mute": 0, "solo": 0}]

// GET
["get_mixer", [], {"ext3": busId}]
["get_mixer_links", [], {}]
["set_stereo_link", [periphId, channelId, 0|1], {}]
["get_afx_strip_order", [], {"ext3": bankId, "return_headers": true}]
```

| payload_id | Команда | Поля |
|------------|---------|------|
| 0x14 | set_mixer | mixer_id, channel, level, pan:6, mute:1, solo:1 |

**Значения level:**
- 0 = 0 dB
- 90 = -90 dB
- 96+ = −∞ (минус бесконечность)

**Значения pan:**
- 0 = полностью L
- 32 = центр
- 63 = полностью R

### Команды эффектов (AFX)

```json
["set_afx_bypass", [periphType, periphId, true|false], {}]
```

| payload_id | Команда | Поля |
|------------|---------|------|
| 0x18 | set_afx_bypass | periph_type, periph_id, enabled |

### Команды маршрутизации (Routing)

```json
["get_routing", [], {"ext3": bankId}]  // bankId 0-12
```

### Глобальные команды

```json
["set_sync_source", [srcIndex], {}]    // 0=internal, 1=spdif, 2=adat, 3=wordclock
["set_samp_rate", [rateIndex], {}]     // index в [44100, 48000, 88200, 96000, 176400, 192000]
["preset_save", [presetIdx], {}]       // 0-7
["preset_recall", [presetIdx], {}]     // 0-7
```

### Другие payload_id (из логов)

| payload_id | Команда | Параметры |
|------------|---------|-----------|
| 0x09 | set_peak_source | bank_id, source_id |
| 0x0A | set_sine_gen | freq_left, freq_right, level, mute_* |

---

## Report IDs (уровень USB)

Manager Server логирует бинарный протокол USB:

| ID | Тип | Описание |
|----|-----|----------|
| `0x70` | SET | Запись параметра |
| `0x73` | CYCLIC | Периодический статус |
| `0x74` | GET | Чтение параметра |
| `0x75` | RESPONSE | Ответ на GET |
| `0x76` | CLEAR | Сброс флагов |
| `0x83` | METERS | Метры уровней эффектов |

Пример из лога:
```
[W 17.02.2026 17:19:15.047]  Request: 0x70 0x16 0x0 0x0 (SET_MIXER)
   'channel': '0x06', 'level': '0x0E', 'mixer_id': '0x00', 'mute': '0x00',
   'pan': '0x02', 'payload_id': '0x14', 'solo': '0x00' => Success
```

---

## Что мы нашли

### 1. Antelope сами логируют декодированный протокол

Manager Server пишет **полностью расшифрованные команды** в лог:
```
/Users/Shared/.AntelopeAudio/logs/managerserver.txt
```

Control Panel логирует высокоуровневые вызовы:
```
/Users/Shared/.AntelopeAudio/logs/zenquadrosc_usb2.txt
```

```
[D 17.02.2026 17:19:15.024] request(set_mixer, (0, 6), {'level': 12, 'mute': False, 'pan': 2, 'sender': 6, ...}) => True
```

### 2. Полная JSON-схема протокола (report_format)

Файл `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/report_format_1.0.4` содержит описание всех 209 команд: типы полей, payload_id, значения заголовков, флаги `auto_send_notification`.

### 3. Состояние устройства в JSON (persistence.JSON)

```
/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/persistence.JSON
```

Содержит текущий routing, mixer state, эффекты, пользовательские имена каналов — всё в читаемом JSON.

---

## CLI клиент (Node.js)

### Установка и запуск

```bash
cd com.isrudoy.antelope.sdPlugin
node antelope/cli.js              # интерактивный режим
node antelope/cli.js 2022         # с указанием порта
node antelope/cli.js status       # oneshot
```

### Автоопределение порта

При запуске CLI сканирует порты 2020-2030, ищет порт с настоящими cyclic reports (проверяет `contents.volumes`).

### Поведение при подключении

1. Подключается к порту
2. Отправляет `initialize_format` (как CP)
3. Запрашивает `get_mixer` для всех шин + `get_routing` для mixer banks + AFX input bank
4. Начинает получать cyclic reports и обновлять состояние

### device_updated

При получении `device_updated=1` в cyclic report (edge 0→1) автоматически перезапрашивает mixer state и routing.

### Notifications

CLI отслеживает `set_mixer` notifications и обновляет внутреннее состояние микшера — не нужно делать get_mixer после каждого изменения.

### Команды выходов (mon, hp1, hp2, line)

| Команда | Описание | Пример |
|---------|----------|--------|
| `vol [output] <0-255>` | Громкость | `vol mon 50`, `vol hp1 100` |
| `mute [output] [on\|off]` | Mute | `mute on`, `mute hp2 off` |
| `dim [output] [on\|off]` | Dim (-20dB) | `dim on`, `dim line off` |

### Команды преампов (1-4)

| Команда | Описание | Пример |
|---------|----------|--------|
| `gain <1-4> <-10..65>` | Gain (dB) | `gain 1 20` |
| `phantom <1-4> [on\|off]` | 48V phantom | `phantom 1 on` |
| `48v <1-4> [on\|off]` | Алиас phantom | `48v 2 off` |
| `phase <1-4> [on\|off]` | Phase invert | `phase 1 on` |
| `input <1-4> [mic\|line]` | Тип входа | `input 1 mic` |

### Команды микшера (bus 0-2, ch 1-16)

| Команда | Описание | Пример |
|---------|----------|--------|
| `bus <0-2>` | Выбрать шину | `bus 0` |
| `fader <1-16> <0-90>` | Уровень фейдера | `fader 1 48` |
| `pan <1-16> <0-63>` | Панорама (0=L, 32=C, 63=R) | `pan 1 0` |
| `solo <1-16> [on\|off]` | Solo канала | `solo 5 on` |
| `ch-mute <1-16> [on\|off]` | Mute канала | `ch-mute 3 on` |
| `link <1-16> [on\|off]` | Stereo link | `link 1 on` |
| `mixer [bus]` | Показать состояние микшера | `mixer 0` |
| `get-mixer` | Перечитать mixer + routing | |

Ch0 = системный канал, ch1-6 = AFX sources, ch7+ = другие источники.

### Команды эффектов (AFX)

| Команда | Описание | Пример |
|---------|----------|--------|
| `bypass <type> <id> [on\|off]` | Bypass эффекта | `bypass 0 1 on` |

### Глобальные команды

| Команда | Описание | Пример |
|---------|----------|--------|
| `clock [internal\|spdif\|adat\|wc]` | Источник клока | `clock internal` |
| `rate <44100\|48000\|...>` | Sample rate | `rate 48000` |
| `preset save <1-8>` | Сохранить пресет | `preset save 1` |
| `preset load <1-8>` | Загрузить пресет | `preset load 3` |

### Служебные команды

| Команда | Описание |
|---------|----------|
| `status` | Состояние устройства (outputs, preamps, global) |
| `dump` | Raw cyclic data в JSON |
| `routing [bankId]` | Показать маршрутизацию (все банки или конкретный) |
| `raw <json>` | Отправить raw JSON команду |
| `help` | Справка |
| `quit` | Выход |

### Пример вывода `status`

```
--- OUTPUTS ---
  Monitor    0 dB
  HP1      -19 dB
  HP2      -96 dB  MUTE
  Line Out -96 dB  MUTE

--- PREAMPS ---
  1:  -6 dB  MIC
  2:   0 dB  LINE
  3:  12 dB  LINE  48V
  4:   0 dB  LINE

--- GLOBAL ---
  Sample rate: 44100 Hz
  Clock source: internal
  Preset: 1
```

### Пример вывода `mixer`

```
--- MIXER: Bus 0 (Monitor/HP1) ---
  Ch  Source       Level    Pan   Mute  Solo
   1  PRE 1 (Mic)   0 dB  C
   2  PRE 2 (Gtr) -90 dB  C
   3  AFX 3         0 dB  L32   MUTE
   4  USB1 1        0 dB  C           SOLO
  ...
```

### Пример вывода `routing`

```
  Bank  7: 64 entries, 6 non-mute: PRE0 PRE1 PRE2 PRE3 USB1_0 USB1_1...
  Bank  8: 64 entries, 16 non-mute: AFX0 AFX1 AFX2 AFX3 AFX4 AFX5 USB1_0 USB1_1...
  Bank  9: 64 entries, 8 non-mute: PRE0 PRE1 PRE2 PRE3 USB1_0 USB1_1...
  Bank 10: 64 entries, 8 non-mute: PRE0 PRE1 PRE2 PRE3 USB1_0 USB1_1...
```

---

## Python пример (как написать свой клиент)

```python
import socket
import json
import struct

def send_command(sock, cmd, args, kwargs=None):
    payload = json.dumps([cmd, args, kwargs or {}]).encode()
    total_length = 4 + len(payload)
    sock.send(struct.pack('>I', total_length) + payload)  # single write

def recv_message(sock):
    header = sock.recv(4)
    total_length = struct.unpack('>I', header)[0]
    payload = sock.recv(total_length - 4)
    return json.loads(payload)

# Подключение (порт определить autodiscovery)
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(('127.0.0.1', 2022))

# Установить громкость монитора 0 на 50
send_command(sock, 'set_volume', [0, 50])

# Получить cyclic report (статус)
msg = recv_message(sock)
print(msg['contents']['volumes'][0])  # {'volume': 50, 'mute': 0, ...}
```

---

## Файлы проекта

| Файл | Описание |
|------|----------|
| `PROTOCOL.md` | Эта документация |
| `antelope/protocol.js` | Wire format: encode/extract/parse пакетов |
| `antelope/constants.js` | Константы устройства (outputs, buses, peripherals) |
| `antelope/antelope.js` | AntelopeClient — EventEmitter API, auto-reconnect, state management |
| `antelope/cli.js` | CLI REPL (интерактивный клиент) |
| `plugin/` | StreamDock plugin (PI + actions) |

---

## Ключевые пути на диске

| Путь (macOS) | Путь (Windows) | Описание |
|------|------|----------|
| `/Users/Shared/.AntelopeAudio/managerserver/` | `%ProgramData%\.AntelopeAudio\managerserver\` | Manager Server |
| `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/` | `%ProgramData%\.AntelopeAudio\zenquadrosc_usb2\panels\` | Control Panel |
| `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/report_format_1.0.4` | `%ProgramData%\.AntelopeAudio\zenquadrosc_usb2\panels\report_format_1.0.4` | Схема протокола (209 команд) |
| `/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/persistence.JSON` | `%ProgramData%\.AntelopeAudio\zenquadrosc_usb2\persistence.JSON` | Состояние устройства |
| `/Users/Shared/.AntelopeAudio/logs/managerserver.txt` | `%ProgramData%\.AntelopeAudio\logs\managerserver.txt` | Логи Manager Server |
| `/Users/Shared/.AntelopeAudio/logs/zenquadrosc_usb2.txt` | `%ProgramData%\.AntelopeAudio\logs\zenquadrosc_usb2.txt` | Логи Control Panel |

---

## Известные ограничения

1. **CP не обновляется от внешних set_mixer** — CP имеет код обработки notifications, но не применяет их к UI. Принято как ограничение.
2. **Порты динамические** — нельзя хардкодить номера портов, нужна autodiscovery.
3. **set_mixer требует ВСЕ параметры** — нельзя послать только level, нужно прочитать текущее состояние и послать все поля.
4. **Channel 0 системный** — в mixer ch0 не отображается в CP, реальные каналы начинаются с 1.
5. **device_updated ~3.5 сек** — нужен edge detection, иначе бесконечный цикл.
