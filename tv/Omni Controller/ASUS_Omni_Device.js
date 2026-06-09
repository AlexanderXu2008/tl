import { AsusKeyboard } from "./ASUS_Keyboard_Protocol.js";
import { AsusMouse } from "./ASUS_Mouse_Protocol.js";
import { Assert } from "@SignalRGB/Errors.js";
import DeviceDiscovery from "@SignalRGB/DeviceDiscovery";
export function Name() { return "ASUS Omni Device"; }
export function VendorId() { return 0x0B05; }
export function ProductId() { return 0x1ACE; }
export function Publisher() { return "WhirlwindFx"; }
export function Documentation() { return "troubleshooting/asus"; }
export function DeviceType(){return "dongle";}
export function Size() { return [1, 1]; }
/* global
LightingMode:readonly
forcedColor:readonly
shutdownMode:readonly
shutdownColor:readonly
idleTimeout:readonly
*/
export function ControllableParameters() {
	return [
		{property: "shutdownMode", group: "lighting", label: "Shutdown Mode", description: "Sets whether the device should follow SignalRGB shutdown color, or go back to hardware lighting", type: "combobox", values: ["SignalRGB", "Hardware"], default: "Hardware" },
		{property:"shutdownColor", group:"lighting", label:"Shutdown Color", description: "This color is applied to the device when the System, or SignalRGB is shutting down", min:"0", max:"360", type:"color", default:"#000000"},
		{property:"LightingMode", group:"lighting", label:"Lighting Mode", description: "Determines where the device's RGB comes from. Canvas will pull from the active Effect, while Forced will override it to a specific color", type:"combobox", values:["Canvas", "Forced"], default:"Canvas"},
		{property:"forcedColor", group:"lighting", label:"Forced Color", description: "The color used when 'Forced' Lighting Mode is enabled", min:"0", max:"360", type:"color", default:"#009bde"},

	];
}

export function ImageUrl() {
	return "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png";
}

export function Validate(endpoint) {
	return endpoint.interface === 1 || endpoint.interface === 2 || endpoint.interface === 3;
}

let isConnected = false;
let deviceType = "Keyboard";
let model;
let savedPollTimer = Date.now();
const PollModeInternal = 1000;

export function Initialize() {
	model = Omni.getDeviceModelKeyboard();

	if(model.length > 0) {
		Omni.initializeOmniKeyboard();

		if(isConnected) {
			DeviceDiscovery.foundVirtualDevice({
				type: "keyboard",
				name: model,
				supported: true,
				vendorId: 0x0B05
			});
			OmniKeyboard.initializeAsus(model);
		}

		return;
	}

	model = Omni.getDeviceModelMouse();

	if(model) {
		deviceType = "Mouse";
		Omni.initializeOmniMouse();

		if(isConnected) {
			DeviceDiscovery.foundVirtualDevice({
				type: "mouse",
				name: model,
				supported: true,
				vendorId: 0x0B05
			});
			OmniMouse.initializeAsus(model);
		}
	}

	if(model.length < 4) { console.log("Firmware returned no model! Try replug the USB cable or close any ASUS conflicting app.") }

}

function readMouseInputs() {
	if (Date.now() - savedPollTimer < PollModeInternal) {
		return;
	}

	savedPollTimer = Date.now();

	device.set_endpoint(
		3,
		0x0001,
		0xffc1);

	do{
		const returnPacket = device.read([0x00], 65);

		if(returnPacket[0] === 0x05 && returnPacket[1] === 0x12 && returnPacket[2] === 0x08) {
			if(returnPacket[5] === 0x01) {
				console.log("Device Reconnected!");
				checkIsConnected();
			}

			if(returnPacket[5] === 0x00) {
				console.log("Device Disconnected!");
				isConnected = false;
			}
		}
	}
	while(device.getLastReadSize() > 0);

	device.set_endpoint(
		2,
		0x01,
		0xff01);
}

function readKeyboardInputs() {
	if (Date.now() - savedPollTimer < PollModeInternal) {
		return;
	}

	savedPollTimer = Date.now();

	device.set_endpoint(
		3,
		0x0001,
		0xffc0);

	do{
		const returnPacket = device.read([0x00], 65);

		if(returnPacket[0] === 0x04 && returnPacket[1] === 0x81 && returnPacket[2] === 0x03) {
			if(returnPacket[5] === 0x01) {
				console.log("Device Reconnected!");
				checkIsConnected();
			}

			if(returnPacket[5] === 0x00) {
				console.log("Device Disconnected!");
				isConnected = false;
			}
		}
    }
	while(device.getLastReadSize() > 0);

	device.set_endpoint(
		2,
		0x01,
		0xff00);
}

function checkIsConnected() {
	if(deviceType === "Mouse") {
		Omni.initializeOmniMouse();

		if(isConnected) {
			DeviceDiscovery.foundVirtualDevice({
				type: "mouse",
				name: model,
				supported: true,
				vendorId: 0x0B05
			});
			OmniMouse.initializeAsus(model);
		}
	} else {
		Omni.initializeOmniKeyboard();

		if(isConnected) {
			DeviceDiscovery.foundVirtualDevice({
				type: "keyboard",
				name: model,
				supported: true,
				vendorId: 0x0B05
			});
			OmniKeyboard.initializeAsus(model);
		}
	}
}

export function Render() {
	if(!isConnected) {
		checkIsConnected();
		device.pause(100);

		return;
	}

	if(deviceType === "Mouse") {
		readMouseInputs();
		OmniMouse.getDeviceBatteryStatus();
		OmniMouse.sendColors();
	} else {
		readKeyboardInputs();
		OmniKeyboard.getDeviceBatteryStatus();
		OmniKeyboard.sendColors();
	}
}

export function Shutdown(SystemSuspending) {
	const color = SystemSuspending ? "#000000" : shutdownColor;
	if(deviceType === "Mouse") {
		OmniMouse.sendColors(color);
	} else {
		OmniKeyboard.sendColors(color);
	}
}

const OmniMouse = new AsusMouse();
const OmniKeyboard = new AsusKeyboard();

class AsusOmniHandler{
	constructor() {
	}

	initializeOmniKeyboard() {
		device.set_endpoint(
			2,
			0x01,
			0xff00);

		const maxAttempts = 4;
		let attempt = 0;
		let deviceAlivePacket;
		let connectedStatus;

		while (attempt < maxAttempts) {
			device.write([0x02, 0x12, 0x03], 64);
			device.pause(10);

			deviceAlivePacket = device.read([0x02, 0x12, 0x03], 64);
			connectedStatus = deviceAlivePacket[5];

			if (connectedStatus === 1) {
				console.log("Wireless device connected, enabling data transfer.");
				isConnected = true;
				break;
			} else {
				isConnected = false;
			}

			attempt++;
			device.pause(50); // Pause to prevent overflow
		}
	}

	initializeOmniMouse() {
		device.set_endpoint(
			2,
			0x01,
			0xff01);

		const maxAttempts = 4;
		let attempt = 0;
		let deviceAlivePacket;
		let connectedStatus;

		while (attempt < maxAttempts) {
			device.write([0x03, 0x12, 0x00, 0x02], 64);
			device.pause(10);

			deviceAlivePacket = device.read([0x03, 0x12, 0x00, 0x02], 64);
			connectedStatus = deviceAlivePacket[5];

			if (connectedStatus === 1) {
				console.log("Wireless device connected, enabling data transfer.");
				isConnected = true;
				break;
			} else {
				isConnected = false;
			}

			attempt++;
			device.pause(50); // Pause to prevent overflow
		}
	}

	getDeviceModelKeyboard() {
		device.set_endpoint(
			2,
			0x01,
			0xff00);

		const modelPacket = sendPacketWithResponse([0x02, 0x12, 0x14, 0x02]).slice(5, 17);
		const model = String.fromCharCode(...modelPacket).trim().replace(/\u0000/g, '');

		console.log(`Model: ${model}`);

		return model;
	}

	getDeviceModelMouse() {
		device.set_endpoint(
			2,
			0x01,
			0xff01);

		//also checks 02
		const modelPacket = sendPacketWithResponse([0x03, 0x12, 0x12, 0x01]).slice(5, 17);

		const model = String.fromCharCode(...modelPacket).trim().replace(/\u0000/g, '');

		console.log(`Model: ${model}`);

		return model;
	}
}

const Omni = new AsusOmniHandler();

export function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}

function sendPacketWithResponse(packet) {
	device.clearReadBuffer();

	device.write(packet, 64);
	device.pause(10);

	const returnPacket = device.read(packet, 64);

	return returnPacket;
}

export function ondpi1Changed() {
	OmniMouse.sendMouseSetting(0);
}

export function ondpi2Changed() {
	OmniMouse.sendMouseSetting(1);
}

export function ondpi3Changed() {
	OmniMouse.sendMouseSetting(2);
}

export function ondpi4Changed() {
	OmniMouse.sendMouseSetting(3);
}

export function onmousePollingChanged() {
	OmniMouse.sendMouseSetting(4);
}

export function onangleSnappingChanged() {
	OmniMouse.sendMouseSetting(6);
}

export function onSettingControlChanged() {
	if(OmniMouse.getDPISupport()){
		for(let i = 0; i< 4; i++){
			OmniMouse.sendMouseSetting(i);
		}

		OmniMouse.sendMouseSetting(4);
		OmniMouse.sendMouseSetting(6);

		OmniMouse.sendLightingSettings();
	}
}