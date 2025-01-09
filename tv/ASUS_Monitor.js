export function Name() { return "ASUS Monitor"; }
export function VendorId() { return 0x0B05; }
export function ProductId() { return Object.keys(ASUS.PIDLibrary); }
export function Publisher() { return "WhirlwindFX"; }
export function Documentation(){ return "troubleshooting/asus"; }
export function Size() { return [1, 1]; }
export function DefaultPosition(){return [10, 100]; }
export function DefaultScale(){return 8.0;}
export function DeviceType(){return "other";}
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters() {
	return [
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color", description: "This color is applied to the device when the System, or SignalRGB is shutting down", "min":"0", "max":"360", "type":"color", "default":"#000000"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode", description: "Determines where the device's RGB comes from. Canvas will pull from the active Effect, while Forced will override it to a specific color", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", description: "The color used when 'Forced' Lighting Mode is enabled", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
	];
}

const vLedNames = [];
const vLedPositions = [];

export function LedNames() {
	return vLedNames;
}

export function LedPositions() {
	return vLedPositions;
}

export function Initialize() {
	ASUS.Initialize();
}

export function Render() {
	ASUS.sendColors();
}

export function Shutdown(SystemSuspending) {

	if(SystemSuspending){
		ASUS.sendColors("#000000"); // Go Dark on System Sleep/Shutdown
	}else{
		ASUS.sendColors(shutdownColor);
	}

}

export class ASUSProtocol {
	constructor() {
		this.PIDLibrary = {
			0x186E: "PG27UQ",
			0x1931: "PG43UQ",
			0x1AC5: "PG248QP"
		};

		this.Layout = {
			0x186E: {
				size: [3, 0],
				leds: 3,
				position: [[0, 0], [1, 0], [2, 0]]
			},
			0x1931: {
				size: [1, 0],
				leds: 1,
				position: [[0, 0]]
			},
			0x1AC5: {
				size: [1, 0],
				leds: 1,
				position: [[0, 0]]
			}
		};
	}

	Initialize() {
		this.ASUSPID = device.productId();
		device.setName("Asus " + this.PIDLibrary[this.ASUSPID]);
		device.log("Device model found: " + this.PIDLibrary[this.ASUSPID]);
		device.log("Device has: " + this.Layout[this.ASUSPID].leds + " LEDs");
		device.setSize(this.Layout[this.ASUSPID].size);
	}

	controlCommand(packet) {

		if(packet.length > 4 ){
			return;
		}
		const data = [0x03, 0x02, 0xa1, 0x80].concat(packet);
		device.send_report(data, 8);
	}

	sendColors(overrideColor) {

		this.controlCommand([0x20, 0x01, 0x00, 0x00]);
		this.controlCommand([0x30, 0x01, 0x00, 0x00]);
		this.controlCommand([0xa0, 0x01, 0x00, 0x00]);

		for (let idx = 0; idx < this.Layout[this.ASUSPID].leds; idx ++) {

			const iPxX = this.Layout[this.ASUSPID].position[idx][0];
			const iPxY = this.Layout[this.ASUSPID].position[idx][1];
			let color;

			if(overrideColor) {
				color = hexToRgb(overrideColor);
			}else if (LightingMode === "Forced") {
				color = hexToRgb(forcedColor);
			}else {
				color = device.color(iPxX, iPxY);
			}

			this.controlCommand([(idx*3), 	color[0], 0x00, 0x00]); // R
			this.controlCommand([(idx*3)+1, color[2], 0x00, 0x00]); // B
			this.controlCommand([(idx*3)+2, color[1], 0x00, 0x00]); // G
		}
	}
}

const ASUS = new ASUSProtocol();

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}

export function Validate(endpoint) {
	return endpoint.interface === -1 || endpoint.interface === 0;
}

export function ImageUrl() {
	return "https://assets.signalrgb.com/devices/brands/asus/misc/pg27uq.png";
}