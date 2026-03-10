/**
 * PropertyInspector 2.5.0 New Features =>
 *
 *      1 => Tools separated from main file - import on demand
 *      2 => $settings - Global persistent data proxy ※
 *      3 => No need to manage context - communicate with plugin anytime
 *      4 => Note: To avoid naming conflicts, do not use $ related names or jQuery library
 *
 * ===== CJHONG ========================================== 2023.10.10 =====>
 */

let $websocket, $uuid, $action, $context, $settings, $lang, $FileID = '', $controller = '';

// Send to plugin
WebSocket.prototype.sendToPlugin = function (payload) {
    this.send(JSON.stringify({
        event: "sendToPlugin",
        action: $action,
        context: $uuid,
        payload
    }));
};

// Set state
WebSocket.prototype.setState = function (state) {
    this.send(JSON.stringify({
        event: "setState",
        context: $context,
        payload: { state }
    }));
};

// Set image
WebSocket.prototype.setImage = function (url) {
    let image = new Image();
    image.src = url;
    image.onload = () => {
        let canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        this.send(JSON.stringify({
            event: "setImage",
            context: $context,
            payload: {
                target: 0,
                image: canvas.toDataURL("image/png")
            }
        }));
    };
};

// Open URL
WebSocket.prototype.openUrl = function (url) {
    this.send(JSON.stringify({
        event: "openUrl",
        payload: { url }
    }));
};

// Save persistent data
WebSocket.prototype.saveData = $.debounce(function (payload) {
    this.send(JSON.stringify({
        event: "setSettings",
        context: $uuid,
        payload
    }));
});

// StreamDock software entry function
async function connectElgatoStreamDeckSocket(port, uuid, event, app, info) {
    info = JSON.parse(info);
    $uuid = uuid; $action = info.action;
    $context = info.context;
    $controller = info.payload?.controller || 'Keypad';
    $websocket = new WebSocket('ws://127.0.0.1:' + port);
    $websocket.onopen = () => $websocket.send(JSON.stringify({ event, uuid }));

    // Persistent data proxy
    $websocket.onmessage = e => {
        let data = JSON.parse(e.data);
        if (data.event === 'didReceiveSettings') {
            $settings = new Proxy(data.payload.settings, {
                get(target, property) {
                    return target[property];
                },
                set(target, property, value) {
                    target[property] = value;
                    $websocket.saveData(data.payload.settings);
                    return true;
                }
            });
            if (!$back) $dom.main.style.display = 'block';
        }
        $propEvent[data.event]?.(data.payload);
    };

    // Auto-translate page
    if (!$local) return;
    $lang = await new Promise(resolve => {
        const req = new XMLHttpRequest();
        req.open('GET', `../../${JSON.parse(app).application.language}.json`);
        req.send();
        req.onreadystatechange = () => {
            if (req.readyState === 4) {
                resolve(JSON.parse(req.responseText).Localization);
            }
        };
    });

    // Traverse and translate all text nodes
    const walker = document.createTreeWalker($dom.main, NodeFilter.SHOW_TEXT, (e) => {
        return e.data.trim() && NodeFilter.FILTER_ACCEPT;
    });
    while (walker.nextNode()) {
        console.log(walker.currentNode.data);
        walker.currentNode.data = $lang[walker.currentNode.data];
    }
    // Special handling for placeholder
    const translate = item => {
        if (item.placeholder?.trim()) {
            console.log(item.placeholder);
            item.placeholder = $lang[item.placeholder];
        }
    };
    $('input', true).forEach(translate);
    $('textarea', true).forEach(translate);
}

// StreamDock file path callback
Array.from($('input[type="file"]', true)).forEach(item => item.addEventListener('click', () => $FileID = item.id));
const onFilePickerReturn = (url) => $emit.send(`File-${$FileID}`, JSON.parse(url));
