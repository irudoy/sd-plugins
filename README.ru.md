[English](README.md) | **Русский**

# StreamDock Plugins

Монорепозиторий плагинов для [StreamDock](https://www.key123.vip/) от MiraBox (также известна как AJAZZ AKP). Мониторинг дисков и заряда Bluetooth-устройств, управление умным домом через Sprut.Hub, контроль аудиооборудования Adam Audio и Antelope Audio, отслеживание VPN-подключений Unifi — всё с динамическим отображением на кнопках и энкодерах StreamDock. Кросс-платформа: macOS и Windows.

> **Баги и запросы фич** — [создайте issue](https://github.com/irudoy/sd-plugins/issues)

<img src="docs/images/sd-all.jpg" width="50%">

Скачайте архивы плагинов со страницы [Releases](https://github.com/irudoy/sd-plugins/releases), распакуйте в директорию плагинов и перезапустите StreamDock:
- **macOS:** `~/Library/Application Support/HotSpot/StreamDock/plugins/`
- **Windows:** `%APPDATA%\HotSpot\StreamDock\plugins\`

> На macOS может потребоваться снять атрибут карантина:
> ```bash
> xattr -cr ~/Library/Application\ Support/HotSpot/StreamDock/plugins/com.isrudoy.*.sdPlugin
> ```

## Содержание

- [🔌 Плагины](#-плагины)
  - [🖥 Mac Tools](#-mac-tools)
  - [🪟 WTools](#-wtools)
  - [🌐 Unifi Network](#-unifi-network)
  - [🏠 Sprut.Hub](#-spruthub)
  - [🔊 A Control](#-a-control)
  - [🎛 Antelope Control](#-antelope-control)
- [🏗 Архитектура](#-архитектура)
- [⚠️ Дисклеймер](#-дисклеймер)

---

## 🔌 Плагины

### 🖥 Mac Tools

Системные утилиты macOS — мониторинг дисков, отслеживание заряда Bluetooth-устройств, запуск скриптов.

| | |
|---|---|
| **Платформа** | macOS |
| **Действия** | 3 |
| **Поддержка Knob** | — |

<img src="docs/images/mactools.png" width="50%">

<details>
<summary><b>Drive Info</b> — Keypad</summary>

Отображает использование диска — занятое/свободное место и процент заполнения. Корректно обрабатывает особенности macOS APFS, где `df` показывает неверные значения для корневого раздела.

</details>

<details>
<summary><b>Battery Monitor</b> — Keypad</summary>

Показывает уровень заряда Apple Bluetooth-устройств (клавиатура, трекпад, мышь и др.) и беспроводных устройств Razer.

> Для устройств Razer требуется разрешение **Input Monitoring** (System Settings → Privacy & Security → Input Monitoring).

</details>

<details>
<summary><b>Run Script</b> — Keypad</summary>

Выполнение AppleScript или JavaScript for Automation (JXA) по нажатию кнопки.

</details>

---

### 🪟 WTools

Мониторинг заряда беспроводных устройств Razer на Windows.

| | |
|---|---|
| **Платформа** | Windows |
| **Действия** | 1 |
| **Поддержка Knob** | — |

<details>
<summary><b>Battery Monitor</b> — Keypad</summary>

Показывает уровень заряда беспроводных устройств Razer. Поддерживает режим двух устройств с разделённым отображением на одной кнопке. Настраиваемый интервал опроса (1–300 сек) и 24-часовой кэш устройств.

</details>

---

### 🌐 Unifi Network

Мониторинг VPN-подключений Unifi Network с цветовой индикацией статуса.

| | |
|---|---|
| **Платформа** | macOS, Windows |
| **Действия** | 1 |
| **Поддержка Knob** | — |

**Настройка:** Откройте Property Inspector действия, введите URL контроллера Unifi и API Key, нажмите "Test Connection", затем выберите VPN-клиент из списка.

> Для генерации API-ключа: Unifi Network Controller → Settings → API.

<details>
<summary><b>VPN Status</b> — Keypad</summary>

Отображает статус VPN-подключения: зелёный (Connected), жёлтый (Connecting), серый (Disconnected), красный (Error). Показывает имя подключения, IP, время работы и статистику трафика.

</details>

---

### 🏠 Sprut.Hub

Управление умным домом через [Sprut.Hub](https://spruthub.ru/) — HomeKit-совместимый контроллер. Синхронизация состояния в реальном времени между всеми кнопками одного устройства.

| | |
|---|---|
| **Платформа** | macOS, Windows |
| **Действия** | 9 |
| **Поддержка Knob** | 5 действий |

<img src="docs/images/spruthub.png" width="50%">

**Настройка:** Откройте Property Inspector любого действия Sprut.Hub, разверните "Connection Settings" и введите **Host**, **Token** и **Serial Number** хаба, нажмите "Test Connection". После подключения выберите комнату, устройство и сервис для каждого действия.

> Плагин не поддерживает встроенную авторизацию. Токен нужно извлечь вручную из веб-интерфейса Sprut.Hub (Developer Tools → Network → параметр `token` в WebSocket auth-сообщениях).

<details>
<summary><b>Light</b> — Keypad + Knob</summary>

Вкл/выкл, регулировка яркости и цветовой температуры. Энкодер регулирует яркость.

</details>

<details>
<summary><b>Switch</b> — Keypad</summary>

Переключение выключателей.

</details>

<details>
<summary><b>Outlet</b> — Keypad</summary>

Управление розетками — вкл/выкл.

</details>

<details>
<summary><b>Lock</b> — Keypad</summary>

Управление замками — открыть/закрыть.

</details>

<details>
<summary><b>Cover</b> — Keypad + Knob</summary>

Управление шторами и жалюзи. Энкодер регулирует положение.

</details>

<details>
<summary><b>Thermostat</b> — Keypad + Knob</summary>

Крупно отображает текущую температуру, целевая температура и режим (нагрев/охлаждение) — в строке статуса. Энкодер регулирует целевую температуру.

</details>

<details>
<summary><b>Sensor</b> — Keypad</summary>

Показания датчиков (температура, влажность и др.) — только чтение.

</details>

<details>
<summary><b>Button</b> — Keypad + Knob</summary>

Отправка событий программируемых кнопок. Энкодер: влево/нажатие/вправо — настраиваемые действия.

</details>

<details>
<summary><b>Scenario</b> — Keypad + Knob</summary>

Запуск сценариев автоматизации.

</details>

---

### 🔊 A Control

Управление студийными мониторами [Adam Audio](https://www.adam-audio.com/) серии A через OCA/AES70 по UDP. Автообнаружение через mDNS — достаточно, чтобы колонки были включены и подключены к той же сети.

| | |
|---|---|
| **Платформа** | macOS, Windows |
| **Действия** | 1 |
| **Поддержка Knob** | Да |

<img src="docs/images/acontrol.png" width="50%">

<details>
<summary><b>Speakers</b> — Keypad + Knob</summary>

Keypad: Mute, DIM, Sleep, выбор входа, Voicing. Knob: регулировка громкости с настраиваемым шагом. Громкость и DIM работают только в режиме External voicing.

</details>

---

### 🎛 Antelope Control

Управление аудиоинтерфейсом [Antelope Audio](https://en.antelopeaudio.com/) Zen Quadro SC. Подключение к Antelope Manager Server на localhost с автоматическим обнаружением порта.

> Требуется запущенный [Antelope Manager](https://en.antelopeaudio.com/support/) на том же компьютере.

| | |
|---|---|
| **Платформа** | macOS, Windows |
| **Действия** | 2 |
| **Поддержка Knob** | Да |

<img src="docs/images/antelope.png" width="50%">

<details>
<summary><b>Output</b> — Keypad + Knob</summary>

Управление аудиовыходами — громкость, mute, dim. Энкодер регулирует громкость.

</details>

<details>
<summary><b>Mixer</b> — Keypad + Knob</summary>

Управление каналами микшера с поддержкой стереосвязки. Связанные каналы отмечены визуальным индикатором. Энкодер регулирует уровень канала.

</details>

---

## 🏗 Архитектура

- **Среда выполнения:** Node.js бэкенд + HTML/JS Property Inspector для UI настроек
- **SDK:** [StreamDock SDK](https://sdk.key123.vip/en/guide/overview.html)
- **Динамические изображения:** [@napi-rs/canvas](https://github.com/nicknisi/napi-rs-canvas) (Skia) — StreamDock не поддерживает SVG, все изображения кнопок рендерятся как PNG
- **Размеры canvas:** 144x144 px (Keypad), 230x144 px (Knob)

## ⚠️ Дисклеймер

Этот проект по большей части навайбкожен — собирается в ограниченное свободное время, из личных потребностей и любопытства, а не в рамках серьёзного инженерного процесса. Тем не менее, я стараюсь поддерживать приличное качество кода и работоспособность.

## Лицензия

[MIT](https://opensource.org/licenses/MIT)
