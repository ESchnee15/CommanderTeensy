// noinspection DuplicatedCode

import {CanvasPlot} from "./CanvasPlot.js";

let numPoints = 2000;
const downsamplingFactor = 5;
const numAnalogIn = 8;
const numStates = 8;
const numDigitalIn = 16;
const numDigitalOut = 8;

const plotConfig = {
    analog: {
        numLines: numAnalogIn + numStates,
        partitions: {
            analog_input: {
                dataID: 'analog',
                numLines: numAnalogIn,
                hasButton: false,
                hasIndicator: false,
                scaleFactors: new Array(numAnalogIn).fill(2 ** -15 * 0.9),
                units: new Array(numAnalogIn).fill('V'),
                unitFormat: (x) => `${(x * 2 ** -12 * 3.3).toFixed(2)}`,
                colorFormat: (i, numLines) => `hsl(${180 / numLines * i}, 80%, 60%)`
            },
            states: {
                dataID: 'states',
                numLines: numStates,
                hasButton: false,
                hasIndicator: false,
                scaleFactors: new Array(numAnalogIn).fill(2 ** -15 * 0.9), //[2 ** -16.5, 2 ** -10, 2 ** -12, 2 ** -12, 1 / 25, 2 ** -22, 2 ** -22, 2 ** -22],
                units: ['cm', 'cm/s', 'cm/s²', 'Δlux', '°C', 'mA', 'Hz', 'kW'],
                unitFormat: (x) => `${x >= 0 ? '0' : ''}${(x / 100).toFixed(2)}`,
                colorFormat: (i, numLines) => `hsl(${180 / numLines * i + 180}, 40%, 50%)`
            },
        }
    },
    digital: {
        numLines: numDigitalIn + numDigitalOut,
        partitions: {
            digital_input: {
                dataID: 'digitalIn',
                numLines: numDigitalIn,
                hasButton: false,
                hasIndicator: '#0F0',
                colorFormat: (i, numLines) => `hsl(${90 / numLines * i}, 80%, 60%)`,
                scaleFactors: new Array(numDigitalIn).fill(1 / (15))
            },
            digital_output: {
                dataID: 'digitalOut',
                numLines: numDigitalOut,
                hasButton: true,
                hasIndicator: '#F00',
                colorFormat: (i, numLines) => `hsl(${120 / numLines * i + 120}, 80%, 60%)`,
                scaleFactors: new Array(numDigitalIn).fill(1 / (15))
            },
        }
    }
};

let wgl_plots = [];

let ws;
let message_queue = [];

createUI();
init();

// Resize Handling, to prevent recalculation spam during event
let resizeId;
window.addEventListener("resize", () => {
    window.clearTimeout(resizeId);
    resizeId = window.setTimeout(doneResizing, 500);
});

function processMessages() {
    // are we buffering too much?
    if (message_queue.length > 10000) {
        message_queue = [];
    }
    let packets = [];
    let dsPackets = [];
    while (message_queue.length >= downsamplingFactor) {
        packets = message_queue.splice(0, downsamplingFactor);
        dsPackets.push(packets[packets.length-1]);
    }

    if (!dsPackets.length) return;
    updateTextDisplay(dsPackets[dsPackets.length - 1]);
    wgl_plots.forEach((plot) => {
        plot.update_data(dsPackets);
        plot.plot.update();
    });
}

// Animation/update_data ticks, maybe lower to 30 fps?
function newFrame() {
    processMessages();
    requestAnimationFrame(newFrame);
}

requestAnimationFrame(newFrame);

function add_label(grid, channel_name, color, box = null, button = null) {
    const div = document.createElement("div");
    div.className = "label";
    div.id = channel_name;
    div.style.backgroundColor = color;
    const p = document.createElement("div");
    p.className = "channel_name";
    p.id = channel_name;
    p.textContent = channel_name;

    if (box != null) {
        div.appendChild(box);
    }
    div.appendChild(p);
    if (button != null) {
        div.appendChild(button);
    }
    grid.appendChild(div);
    return div;
}

function createUI() {
    for (const [canvasID, cfg] of Object.entries(plotConfig)) {
        const label_grid = document.querySelector(`#grid_${canvasID}`);

        for (const [partitionID, partition] of Object.entries(cfg.partitions)) {
            for (let i = 0; i < partition.numLines; i++) {
                let color = partition.colorFormat(i, partition.numLines);
                let box;

                // unit labels for analog channels and states
                if (partition.units) {
                    box = document.createElement('div');
                    box.id = `${partitionID}_${i}`
                    box.className = `unit_field ${partitionID}`
                }

                // digital indicator box
                if (partition.hasIndicator) {
                    box = document.createElement('div');
                    box.className = "indicator";
                    box.id = `${partitionID}_${i}`;
                }

                // toggle button for digital output channels
                let button;
                if (partition.hasButton) {
                    button = document.createElement('button');
                    let text = document.createTextNode('toggle');
                    button.appendChild(text)
                    button.className = "toggle_button";
                    button.id = `${partitionID}_${i}`;
                    button.onclick = btn_clicked;
                }

                add_label(label_grid, `${partitionID}_${i}`, color, box, button);

            }
        }
    }
}

function init() {
    // One Plot per Canvas
    for (const canvasID of Object.keys(plotConfig)) {
        const webgl_plot = new CanvasPlot(canvasID, numPoints, plotConfig);
        wgl_plots.push(webgl_plot);
    }

    // start accepting messages
    ws = start_websocket(5678);
    ws.onmessage = ws_message_receive;
}

function doneResizing() {
    //wglp.viewport(0, 0, canv.width, canv.height);
}


function start_websocket(ws_port) {
    const url = window.location.hostname;
    const ws = new ReconnectingWebSocket(`ws://${url}:${ws_port.toString()}`);
    ws.reconnectInterval = 500;
    ws.maxReconnectInterval = 1000;
    ws.timeoutInterval = 400;
    return ws;
}

function ws_message_receive(event) {
    if (typeof event.data !== 'string') return;

    let packet;
    try {
        packet = JSON.parse(event.data);
    } catch (e) {
        console.error(e);
        console.log(event.data);
        return;
    }
    message_queue.push(packet);
}


function updateTextDisplay(packet) {
    if (!packet) return;

    for (const [canvasID, cfg] of Object.entries(plotConfig)) {
        for (const [partitionID, partition] of Object.entries(cfg.partitions)) {
            for (let i = 0; i < partition.numLines; i++) {
                let x;
                try {
                    x = packet[partition.dataID][i];
                } catch (e) {
                    console.error(e)
                    console.debug(partition.dataID)
                    console.debug(partition)
                }

                if (partition.units) {
                    const lbl = document.querySelector(`.unit_field#${partitionID}_${i}`);
                    let lblText = partition.unitFormat ? partition.unitFormat(x) : x.toFixed(2);
                    if (partition.units) {
                        lblText = lblText + ' ' + partition.units[i];
                    }
                    lbl.textContent = lblText;
                }

                if (partition.hasIndicator) {
                    let bg_color = x ? partition.hasIndicator : '#000'; // hasIndicator is flag and ON color
                    const indicator = document.querySelector(`.indicator#${partitionID}_${i}`);
                    indicator.style.backgroundColor = bg_color;
                }
            }
        }
    }
}

function btn_clicked(event) {
    console.log(event.target.id);
    if (ws) {
        ws.send(event.target.id);
    }
}

/**
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 1].
 * FROM: https://stackoverflow.com/a/9493060
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        let hue2rgb = function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r, g, b];
}