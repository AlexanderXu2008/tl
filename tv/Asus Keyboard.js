export function Name() { return "Asus Keyboard"; }
export function VendorId() { return 0x0B05; }
export function ProductId() { return Object.keys(ASUSdeviceLibrary.PIDLibrary); }
export function Publisher() { return "WhirlwindFx"; }
export function Documentation(){ return "troubleshooting/asus"; }
export function Size() { return [1, 1]; }
export function DefaultPosition(){return [0, 0];}
export function DefaultScale(){return 1.0;}
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters() {
	return [
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
	];
}

let savedPollTimer = Date.now();
const PollModeInternal = 15000;

let isOmniDongle = false;
let isConnected = false;

export function Initialize() {
	isConnected = false;
	isOmniDongle = false;
	checkHandles();

	if(isOmniDongle) {
		dongleJunk();
	}

	ASUS.InitializeASUS();
	
	if(isOmniDongle) {
		checkConnectivity();
	}
}

export function Render() {
	if(isConnected) {
		ASUS.getDeviceBatteryStatus();
		ASUS.sendColors();
	}
	if(isOmniDongle) {
		readInputs();
	}
}

export function Shutdown(SystemSuspending) {

	if(SystemSuspending){
		ASUS.sendColors("#000000"); // Go Dark on System Sleep/Shutdown
	}else{
		device.write([isOmniDongle ? 0x02 : 0x00, 0x51, 0x2C, 0x02, 0x00, 0x1F, 0x64, 0x00, 0xFF, 0xFF], 64);
		device.write([isOmniDongle ? 0x02 : 0x00, 0x50, 0x55], 64);
	}

}

function checkHandles() {
	const handles = device.getHidEndpoints();

	for(let hidEndpoints = 0; hidEndpoints < handles.length; hidEndpoints++) {
		const hidEndpoint = handles[hidEndpoints];

		if(hidEndpoint.interface === 2 && hidEndpoint.usage === 1 && hidEndpoint.usage_page === 0xff02) {
			device.log("WE HAZ A DONGLE!");
			isOmniDongle = true;
		}
	}
}

function checkConnectivity() {
	device.set_endpoint(ASUS.Config.DeviceEndpoint[`interface`], ASUS.Config.DeviceEndpoint[`usage`], ASUS.Config.DeviceEndpoint[`usage_page`]);
	device.clearReadBuffer();

	device.write([0x02, 0x12, 0x03], 64);
	device.pause(10);

	const deviceAlivePacket = device.read([0x02, 0x12, 0x03], 64);

	if(deviceAlivePacket[5] === 0) {
		device.log("Wired device, forcing connected status to true.");
		isConnected = true;
	} else if (deviceAlivePacket[5] === 1) {
		device.log("Wireless device connected, enabling data transfer.");
		isConnected = true;
	} else {
		device.log(`No device Connected (in theory). Connection Status Byte: ${deviceAlivePacket[5]}`);
	}

	const modelPacket = gimmePacketWithResponse([0x02, 0x12, 0x14, 0x02]).slice(5, 17); //D23120500771.

	const model = String.fromCharCode(...modelPacket);
	device.log(`Possible Model return: ${model}`);
	device.log(`Model from Model String: ${modelDict[model] ?? "We Haz No Model For this"}`);
	
	ASUS.setDeviceProductId(device.productId());
	ASUS.setDeviceName(modelDict[model]);

	const DeviceProperties = ASUS.getDeviceProperties(modelDict[model]);

	ASUS.setDeviceEndpoint(DeviceProperties.Endpoint);
	ASUS.setLeds(DeviceProperties.vLeds);
	ASUS.setLedNames(DeviceProperties.vLedNames);
	ASUS.setLedPositions(DeviceProperties.vLedPositions);
	ASUS.setDeviceImage(DeviceProperties.image);
	device.set_endpoint(DeviceProperties.Endpoint[`interface`], DeviceProperties.Endpoint[`usage`], DeviceProperties.Endpoint[`usage_page`]);
	console.log("Initializing device...");

	if(DeviceProperties.Battery){
		ASUS.setBatteryFeature(true);

		device.addFeature("battery");
		console.log("Device has a battery and it's wireless");
		ASUS.modernFetchBatteryLevel();
	}

	device.log(`Device model found: ` + ASUS.getDeviceName());
	device.setName("ASUS " + ASUS.getDeviceName());
	device.setSize(DeviceProperties.size);
	device.setControllableLeds(ASUS.getLedNames(), ASUS.getLedPositions());
	device.setImageFromUrl(ASUS.getDeviceImage());
}

const modelDict = {
	"A22114900551" : "ROG Azoth",
	"A23114802907" : "ROG Azoth QWERTZ",
	"R2MPGDD01967s" : "ROG Azoth QWERTY",
	"D23120500771" : "ROG Strix Scope II 96"
};

function readInputs() {
	device.set_endpoint(isOmniDongle ? 3 : 2, 0x0001, 0xffc0);

	do {
		const returnPacket = device.read([0x00], 64, 1);

		if(returnPacket[0] === 4 && returnPacket[1] === 129) {
			if(returnPacket[2] === 3) {
				device.log(`Connection Event! Is Connected Byte: ${returnPacket[4]}`);
				isConnected = returnPacket[4] === 1;
				continue;
			}

			//2 is header? 5 0 1 might be a status or smth?
			device.log(returnPacket);
			//We do not care about 114 either smh or 145.
			//though 114, 0 is bye bye.
			//113 is not useful ***YET***
		}
	}
	while(device.getLastReadSize() > 0);
	//You can run but you can't hide from me.

	device.set_endpoint(ASUS.Config.DeviceEndpoint[`interface`], ASUS.Config.DeviceEndpoint[`usage`], ASUS.Config.DeviceEndpoint[`usage_page`]);
}

function dongleJunk() {
	device.set_endpoint(2, 0x0001, 0xFF02, 0x0000);
	//Hello there dongle
	device.log(`Random Dongle Packets Go!`);
	gimmePacketWithResponse([0x01, 0xa0]); //1 0 b0 1a 02 04, could represent transaction id's, paired device count, etc.

	const serialReturn = gimmePacketWithResponse([0x01, 0xa1]).slice(5, 18); //Returns serial and then 0x73 which is S char.
	const serialString = String.fromCharCode(...serialReturn);
	device.log(`USB Serial String: ${serialString}`);
	gimmePacketWithResponse([0x01, 0xa1, 0x01]); ///shrug
}

//keeb 5.00.02
//dongle 4.00.02

function gimmePacketWithResponse(packet) {
	device.clearReadBuffer();

	device.write(packet, 64);
	device.pause(10);

	const returnPacket = device.read(packet, 64);
	device.log(returnPacket);

	return returnPacket;
}

export class ASUS_Keyboard_Protocol {
	constructor() {
		this.Config = {
			DeviceProductID: 0x0000,
			DeviceName: "Asus Scope",
			DeviceEndpoint: { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
			Leds: [],
			LedNames: [],
			LedPositions: [],
			SupportedFeatures:
			{
				BatterySupport: false,
			}
		};
	}

	getDeviceProperties(deviceName) { return ASUSdeviceLibrary.LEDLibrary[deviceName];};

	getDeviceProductId() { return this.Config.DeviceProductID; }
	setDeviceProductId(productID) { this.Config.DeviceProductID = productID; }

	getDeviceName() { return this.Config.DeviceName; }
	setDeviceName(deviceName) { this.Config.DeviceName = deviceName; }

	getDeviceEndpoint() { return this.Config.DeviceEndpoint; }
	setDeviceEndpoint(deviceEndpoint) { this.Config.DeviceEndpoint = deviceEndpoint; }

	getLedsPerPacket() {return this.Config.ledsPerPacket; }
	setLedsPerPacket(ledsperpacket) { this.Config.ledsPerPacket = ledsperpacket; }

	getLeds() { return this.Config.Leds; }
	setLeds(leds) { this.Config.Leds = leds; }

	getLedNames() { return this.Config.LedNames; }
	setLedNames(ledNames) { this.Config.LedNames = ledNames; }

	getLedPositions() { return this.Config.LedPositions; }
	setLedPositions(ledPositions) { this.Config.LedPositions = ledPositions; }

	getBatteryFeature() { return this.Config.SupportedFeatures.BatterySupport; }
	setBatteryFeature(battery) { this.Config.SupportedFeatures.BatterySupport = battery; }

	getDeviceImage() { return this.Config.image; }
	setDeviceImage(image) { this.Config.image = image; }

	InitializeASUS() {
		//Initializing vars
		this.setDeviceProductId(device.productId());
		this.setDeviceName(ASUSdeviceLibrary.PIDLibrary[this.getDeviceProductId()]);
		const DeviceProperties = this.getDeviceProperties(this.getDeviceName());
		this.setDeviceEndpoint(DeviceProperties.Endpoint);
		this.setLeds(DeviceProperties.vLeds);
		this.setLedNames(DeviceProperties.vLedNames);
		this.setLedPositions(DeviceProperties.vLedPositions);
		this.setDeviceImage(DeviceProperties.image);
		device.set_endpoint(DeviceProperties.Endpoint[`interface`], DeviceProperties.Endpoint[`usage`], DeviceProperties.Endpoint[`usage_page`]);
		console.log("Initializing device...");

		if(DeviceProperties.Battery){
			this.setBatteryFeature(true);

			device.addFeature("battery");
			console.log("Device has a battery and it's wireless");
			this.modernFetchBatteryLevel();
		}

		device.log(`Device model found: ` + this.getDeviceName());
		device.setName("ASUS " + this.getDeviceName());
		device.setSize(DeviceProperties.size);
		device.setControllableLeds(this.getLedNames(), this.getLedPositions());
		device.setImageFromUrl(this.getDeviceImage());

	}

	sendColors(overrideColor) {

		const deviceLeds = this.getLeds();
		const deviceLedPositions = this.getLedPositions();
		const TotalLEDs = deviceLeds.length;
		const RGBData = [];

		let TotalLedCount = TotalLEDs;
		let packetCount = 0;

		for (let iIdx = 0; iIdx < TotalLEDs; iIdx++) {
			const iPxX = deviceLedPositions[iIdx][0];
			const iPxY = deviceLedPositions[iIdx][1];
			let color;

			if(overrideColor){
				color = hexToRgb(overrideColor);
			}else if (LightingMode === "Forced") {
				color = hexToRgb(forcedColor);
			}else{
				color = device.color(iPxX, iPxY);
			}

			RGBData[iIdx * 4 + 0] = deviceLeds[iIdx];
			RGBData[iIdx * 4 + 1] = color[0];
			RGBData[iIdx * 4 + 2] = color[1];
			RGBData[iIdx * 4 + 3] = color[2];
		}

		while(TotalLedCount > 0){
			const ledsPerPacket = isOmniDongle ? 14 :15;
			//scope 96 was being weird if I did 15. blue byte got chopped because it's not zero padded.
			const ledsToSend = TotalLedCount >= ledsPerPacket ? ledsPerPacket : TotalLedCount;

			device.write([isOmniDongle ? 0x02 : 0x00, 0xC0, 0x81, ledsToSend, 0x00].concat(RGBData.splice(0, ledsToSend*4)), 65);
			TotalLedCount -= ledsToSend;
		}
	}

	getDeviceBatteryStatus() {

		if(this.getBatteryFeature()){
			if (Date.now() - savedPollTimer < PollModeInternal) {
				return;
			}

			console.log("Device has battery, polling info...");
			savedPollTimer = Date.now();

			this.modernFetchBatteryLevel();
		}

	}

	modernFetchBatteryLevel() {
		device.clearReadBuffer();

		const packet = [isOmniDongle ? 0x02 : 0x00, 0x12, 0x01]; //0x00, 0x12, 0x00 is some sort of status. also hits 0x02
		device.write(packet, 65);
		device.pause(5);

		const returnpacket = device.read(packet, 65);
		const BatteryPercentage = returnpacket[6];
		battery.setBatteryLevel(BatteryPercentage);
		battery.setBatteryState(returnpacket[9] + 1);
	}
}

export class deviceLibrary {
	constructor(){
		this.PIDLibrary	=	{
			0x1A07: "Omni Receiver",
			0x1ACE: "ROG Strix Scope II 96 Wireless", // Omni Receiver
			0x194B: "TUF K3",
			0x1A83: "ROG Azoth", // Wired
			0x1A85: "ROG Azoth",
			0x193C: "ROG Falchion", // Wired
			0x193E: "ROG Falchion",
			0x1A64: "ROG Falchion", //Ace
			0x1875: "ROG Strix Flare",
			0x18AF: "ROG Strix Flare",
			0x18CF: "ROG Strix Flare",
			0x19FE: "ROG Strix Flare II Standard",
			0x19FC: "ROG Strix Flare II Animate", // Animate
			0x18F6: "ROG Strix Scope", // Wireless
			0x18F8: "ROG Strix Scope",
			0x190C: "ROG Strix Scope TKL",
			0x1954: "ROG Strix Scope TKL", // Electro Punk
			0x19D0: "ROG Strix Scope TKL", // Moonlight White
			0x1951: "ROG Strix Scope RX",
			0x1A05: "ROG Strix Scope RX", // Deluxe
			0x19F6: "ROG Strix Scope NX", // Deluxe Wired
			0x19F8: "ROG Strix Scope NX", // Deluxe Wireless
			0x1AAE: "ROG Strix Scope II 96", // Wired
			0x1AB3: "ROG Strix Scope II NX", // Snow
			0x1AB5: "ROG Strix Scope II RX"
		};

		this.LEDLibrary	=	{
			"TUF K3":
			{
				size: [22, 6],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,   123,                  155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180,
					5,    13, 21,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                              "Num 4", "Num 5", "Num 6",             //16
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                                  "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //17
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num .",                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], [13, 0],      [14, 0], [15, 0], [16, 0],            //20
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],   [17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],   [17, 2], [18, 2], [19, 2], [20, 3], //20
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],  [13, 3],                             [17, 3], [18, 3], [19, 3], // 17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],       [13, 4],           [15, 4],           [17, 4], [18, 4], [19, 4], [20, 4], // 17
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],    [14, 5], [15, 5], [16, 5],   [17, 5],         [19, 5],               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/tuf-k3.png"
			},
			"ROG Azoth QWERTY":
			{
				size: [15, 6],
				vLeds:[
					0,  8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,   //13
					1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,  121, //15
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 107, 122, //15
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,       123, //14
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100,116, 124, //15
					5, 13, 21,             53,         85, 93, 101, 109, 117, 125, //10
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",    //13
					"^", "1",  "2", "3", "4", "5",  "6", "7", "8", "9", "0",  "ß", "`", "Backspace", "Ins", //15
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü", "+", "ENTER", "Del", //15
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä", "ISO #", "PgUp", //14
					"Left Shift", "ISO <", "Y", "X", "C", "V", "B", "N", "M", ",", ".", "-", "Right Shift", "Up Arrow", "PgDn", //15
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "FN", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", //10
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0],    //13
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],  //15
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],  //15
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [14, 3],  //14
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],  //15
					[0, 5], [1, 5], [2, 5],  [5, 5],  [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],  //10
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				Battery: true,
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/azoth.png"
			},
			"ROG Azoth QWERTZ":
			{
				size: [15, 6],
				vLeds:[
					0,  8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,   //13
					1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,  121, //15
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 107, 122, //15
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,       123, //14
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100,116, 124, //15
					5, 13, 21,             53,         85, 93, 101, 109, 117, 125, //10
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",    //13
					"^", "1",  "2", "3", "4", "5",  "6", "7", "8", "9", "0",  "ß", "`", "Backspace", "Ins", //15
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü", "+", "ENTER", "Del", //15
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä", "ISO #", "PgUp", //14
					"Left Shift", "ISO <", "Y", "X", "C", "V", "B", "N", "M", ",", ".", "-", "Right Shift", "Up Arrow", "PgDn", //15
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "FN", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", //10
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0],    //13
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],  //15
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],  //15
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [14, 3],  //14
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],  //15
					[0, 5], [1, 5], [2, 5],  [5, 5],  [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],  //10
				],
				Endpoint : { "interface": 2, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000  },
				Battery: true,
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/azoth.png"
			},			
			"ROG Azoth":
			{
				size: [15, 6],
				vLeds:[
					0,  8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,   //13
					1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,  121, //15
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 107, 122, //15
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,       123, //14
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100,116, 124, //15
					5, 13, 21,             53,         85, 93, 101, 109, 117, 125, //10
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",    //13
					"^", "1",  "2", "3", "4", "5",  "6", "7", "8", "9", "0",  "ß", "`", "Backspace", "Ins", //15
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü", "+", "ENTER", "Del", //15
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä", "ISO #", "PgUp", //14
					"Left Shift", "ISO <", "Y", "X", "C", "V", "B", "N", "M", ",", ".", "-", "Right Shift", "Up Arrow", "PgDn", //15
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "FN", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", //10
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0],    //13
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],  //15
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],  //15
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [14, 3],  //14
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],  //15
					[0, 5], [1, 5], [2, 5],  [5, 5],  [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],  //10
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/azoth.png"
			},
			"ROG Falchion":
			{
				size: [15, 5],
				vLeds:[
					0, 8,  16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104,			112,
					1, 9,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,			113,
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98,    106,		114,
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,		107,	115,
					4, 12, 20,         52,         76, 84, 92,			100, 108, 116,
				],
				vLedNames: [
					"Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",								"Insert",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",				 /*EntTop*/					"Del",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/",					"Enter",				"Page Up",
					"Left Shift", "ISO_<",  "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",		  "Up Arrow",	"Page Down",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow",
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0],	   [14, 0],   //15
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],	   [14, 1],   //14
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2],  [13, 2],   [14, 2],   //15
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],   [13, 3],  [14, 3],   //15
					[0, 4], [1, 4], [2, 4],                         [6, 4],					[9, 4], [10, 4], [11, 4],   [12, 4], [13, 4], [14, 4],    //10
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/falchion.png"
			},
			"ROG Strix Flare":
			{
				size: [22, 6],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,   123,                  155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180,
					5,    13, 21,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173,

					184, 185, 186,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                              "Num 4", "Num 5", "Num 6",             //16
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                                  "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //17
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num .",                       //13
					"Logo", "Left underglow", "Right underglow"
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], [13, 0],      [14, 0], [15, 0], [16, 0],            //20
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],   [17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],   [17, 2], [18, 2], [19, 2], [20, 3], //20
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],  [13, 3],                             [17, 3], [18, 3], [19, 3], // 17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],       [13, 4],           [15, 4],           [17, 4], [18, 4], [19, 4], [20, 4], // 17
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],    [14, 5], [15, 5], [16, 5],   [17, 5],         [19, 5],               // 13
					//Logo,  left underglow, right underglow
					[18, 0], [0, 2], [21, 2],
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-flare-standard.png"
			},
			"ROG Strix Flare II Standard":
			{
				size: [24, 7],
				vLeds:[
					0,     24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144, 176, 168, //18
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177, //21
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178, //21
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,   123,                    155, 163, 171, //16
					4,   12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180, //17
					5,  29, 21,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173 //13
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break", "Logo 1", "Logo 2", //16
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                      "Num 4", "Num 5", "Num 6",             //16
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                 "Up Arrow",                       "Num 1", "Num 2", "Num 3", "Num Enter", //17
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], [13, 0],      [14, 0], [15, 0], [16, 0],       [17, 0], [18, 0],     //20
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],   [17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],   [17, 2], [18, 2], [19, 2], [20, 3], //20
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],                             [17, 3], [18, 3], [19, 3], // 17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],         [13, 4],           [15, 4],           [17, 4], [18, 4], [19, 4], [20, 4], // 17
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],    [14, 5], [15, 5], [16, 5],   [17, 5],         [19, 5]               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-flare-ii-animate.png"
			},
			"ROG Strix Flare II Animate":
			{
				size: [24, 7],
				vLeds:[
					0,     24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144, //16
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177, //21
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178, //21
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,   123,                    155, 163, 171, //16
					4,   12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180, //17
					5,  29, 21,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173, //13

					6, 14, 22, 30, 38, 46, 54, 62, 70, 78, 86, 94, 102, 110, 118, 126, 134, 142, 150, 158, 166, 174, 182, 190, 198, 206, 214, 222, 230, 238 //29
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break", //16
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                      "Num 4", "Num 5", "Num 6",             //16
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                 "Up Arrow",                       "Num 1", "Num 2", "Num 3", "Num Enter", //17
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num .",                       //13

					"Underglow 1", "Underglow 2", "Underglow 3", "Underglow 4", "Underglow 5", "Underglow 6", "Underglow 7", "Underglow 8", "Underglow 9", "Underglow 10", "Underglow 11", "Underglow 12", //12
					"Underglow 13", "Underglow 14", "Underglow 15", "Underglow 16", "Underglow 17", "Underglow 18", "Underglow 19", "Underglow 20", "Underglow 21", "Underglow 22", "Underglow 23", "Underglow 24", //12
					"Underglow 25", "Underglow 26", "Underglow 27", "Underglow 28", "Underglow 29", "Underglow 30" //5
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], [13, 0],      [14, 0], [15, 0], [16, 0],            //20
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],   [17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],   [17, 2], [18, 2], [19, 2], [20, 3], //20
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],                             [17, 3], [18, 3], [19, 3], // 17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],         [13, 4],           [15, 4],           [17, 4], [18, 4], [19, 4], [20, 4], // 17
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],    [14, 5], [15, 5], [16, 5],   [17, 5],         [19, 5],               // 13
					// underglow
					[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [4, 6], [5, 6], [6, 6], [7, 6], [7, 6], [8, 6], [9, 6], [10, 6], [10, 6], [11, 6], [12, 6], [13, 6], [13, 6], [14, 6], [15, 6], [16, 6], [16, 6], [17, 6], [18, 6], [19, 6], [20, 6], [20, 6], [21, 6], [22, 6], [23, 6],
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-flare-ii-animate.png"
			},
			"ROG Strix Scope":
			{
				size: [21, 6],
				vLeds:[
					0,      24, 32, 40, 48,     64, 72, 80, 88, 96, 104, 112, 120,	 128, 136, 144,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,      121,	 129, 137, 145,	 153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,      122,	 130, 138, 146,	 154, 162, 170, 178,
					3,  19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,      123,					 155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,           124,		  140,		 156, 164, 172, 180,
					5,  21, 29,      53,            77,     93, 101,          125,   133, 141, 149,  157,	   173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                              "Num 4", "Num 5", "Num 6",             //16
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                                  "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //17
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], [13, 0],      [14, 0], [15, 0], [16, 0],            //20
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],   [17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],   [17, 2], [18, 2], [19, 2], [20, 3], //20
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],                             [17, 3], [18, 3], [19, 3], // 17
					[0, 4],      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],              [13, 4],           [15, 4],           [17, 4], [18, 4], [19, 4], [20, 4], // 17
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],    [14, 5], [15, 5], [16, 5],   [17, 5],         [19, 5],               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-standard.png"
			},
			"ROG Strix Scope TKL":
			{
				size: [17, 7],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,  128,  144,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,  123,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,
					5,    21, 29,      53,            77, 93, 101,  125,   133, 141, 149,

					6, 14, 22, 30, 38, 46, 54, 62, 70, 78, 86, 94, 102, 110, 118, 126, 134, 142,  150, 158, 166, 174, 182, 190, 198, 206
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Logo 1", "Logo 2",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                                  "Up Arrow",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow",

					"LightBar Led 1", "LightBar Led 2", "LightBar Led 3", "LightBar Led 4", "LightBar Led 5", "LightBar Led 6", "LightBar Led 7", "LightBar Led 8", "LightBar Led 9",
					"LightBar Led 10", "LightBar Led 11", "LightBar Led 12", "LightBar Led 13", "LightBar Led 14", "LightBar Led 15", "LightBar Led 16", "LightBar Led 17", "LightBar Led 18",
					"LightBar Led 19", "LightBar Led 20", "LightBar Led 21", "LightBar Led 22", "LightBar Led 23", "LightBar Led 24", "LightBar Led 25", "LightBar Led 26"
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], [13, 0],       [14, 0],        [16, 0],
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1],  [12, 1], [13, 1],  [14, 1], [15, 1], [16, 1],
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],
					[0, 4],      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],    [13, 4],           [15, 4],
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],    [14, 5], [15, 5], [16, 5],

					[0, 6], [0, 6], [1, 6], [1, 6], [2, 6], [3, 6], [4, 6], [4, 6], [5, 6],  [5, 6], [6, 6], [7, 6], [7, 6], [8, 6], [9, 6], [9, 6], [10, 6], [11, 6], [11, 6], [12, 6], [13, 6], [13, 6], [14, 6], [15, 6], [16, 6], [16, 6]
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-tkl.png"

			},
			"ROG Strix Scope RX":
			{
				size: [21, 6],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144, 168, 176,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,  123,                  155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180,
					5,    21, 29,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break", "ROG1", "ROG2",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                          "Num 4", "Num 5", "Num 6",             //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                             "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], 				 [14, 0], [15, 0], [16, 0],		[17, 0], [18, 0],       //18
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],		[17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],		[17, 2], [18, 2], [19, 2], [20, 2], //21
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],									[17, 3], [18, 3], [19, 3], //17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],			  [15, 4],				[17, 4], [18, 4], [19, 4], [20, 4], // 18
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],		 [14, 5], [15, 5], [16, 5],		[17, 5],		  [19, 5],               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-rx.png"
			},
			"ROG Strix Scope NX":
			{
				size: [21, 6],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144, 168, 176,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,  123,                  155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180,
					5,    21, 29,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break", "ROG1", "ROG2",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                          "Num 4", "Num 5", "Num 6",             //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                             "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], 				 [14, 0], [15, 0], [16, 0],		[17, 0], [18, 0],       //18
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],		[17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],		[17, 2], [18, 2], [19, 2], [20, 2], //21
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],									[17, 3], [18, 3], [19, 3], //17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],			  [15, 4],				[17, 4], [18, 4], [19, 4], [20, 4], // 18
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],		 [14, 5], [15, 5], [16, 5],		[17, 5],		  [19, 5],               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-rx.png"
			},
			"ROG Strix Scope II 96":
			{
				size: [18, 6],
				vLeds:[
					0, 8,  16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,  104,  112, 120, 128, 136, //18
					1, 9,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97,  105,       121, 129, 137, 145, //18
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98,  106,	   122, 130, 138, 146, //18
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,  107,       123, 131, 139, //17
					4, 12, 20, 28, 36, 44, 52, 60, 68,     76, 84, 92, 100,	  116, 124, 132, 140, 148, //18
					5, 13, 21,	   45, 53, 61,         85, 93, 101, 109, 117, 125, 133, 141//14
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Ins", "Del", "PgUp", "PgDn", "ROG Logo", //18
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "Num", "Num /", "Num *", "Num -", //18
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", 		"Num 7", "Num 8", "Num 9", "Num +", //18
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",		"Num 4", "Num 5", "Num 6", //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift", "Up Arrow", "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "LSpace", "Space", "RSpace", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ." //14
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], //18
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], //18
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], //18
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],          [15, 3], [16, 3], [17, 3], //17
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [15, 4], [16, 4], [17, 4], //18
					[0, 5], [1, 5], [2, 5],			        [5, 5],	[6, 5], [7, 5],                 [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], //14
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				Battery: true,
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-ii-96-wireless.png"
			},
			"ROG Strix Scope II 96 Wireless":
			{
				size: [18, 6],
				vLeds:[
					0, 8,  16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,  104,  112, 120, 128, 136, //18
					1, 9,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97,  105,       121, 129, 137, 145, //18
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98,  106,	   122, 130, 138, 146, //18
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,  107,       123, 131, 139, //17
					4, 12, 20, 28, 36, 44, 52, 60, 68,     76, 84, 92, 100,	  116, 124, 132, 140, 148, //18
					5, 13, 21,	   45, 53, 61,         85, 93, 101, 109, 117, 125, 133, 141//14
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Ins", "Del", "PgUp", "PgDn", "ROG Logo", //18
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "Num", "Num /", "Num *", "Num -", //18
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", 		"Num 7", "Num 8", "Num 9", "Num +", //18
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",		"Num 4", "Num 5", "Num 6", //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift", "Up Arrow", "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "LSpace", "Space", "RSpace", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ." //14
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], //18
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], //18
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], //18
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],          [15, 3], [16, 3], [17, 3], //17
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [15, 4], [16, 4], [17, 4], //18
					[0, 5], [1, 5], [2, 5],			        [5, 5],	[6, 5], [7, 5],                 [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], //14
				],
				Endpoint : { "interface": 2, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000  },
				Battery: true,
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-ii-96-wireless.png"
			},
			"ROG Strix Scope II NX":
			{
				size: [21, 6],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144, 160,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,  123,                  155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180,
					5,    13, 21,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break", "Logo",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                          "Num 4", "Num 5", "Num 6",             //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                             "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], 				 [14, 0], [15, 0], [16, 0],		[17, 0],
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],		[17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],		[17, 2], [18, 2], [19, 2], [20, 2], //21
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],									[17, 3], [18, 3], [19, 3], //17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],			  [15, 4],				[17, 4], [18, 4], [19, 4], [20, 4], // 18
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],		 [14, 5], [15, 5], [16, 5],		[17, 5],		  [19, 5],               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-ii-nx.png"
			},
			"ROG Strix Scope II RX":
			{
				size: [21, 6],
				vLeds:[
					0,      24, 32, 40, 48,   64, 72, 80, 88,  96, 104, 112, 120,   128, 136, 144, 160,
					1,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    121,   129, 137, 145,   153, 161, 169, 177,
					2,  18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    122,   130, 138, 146,   154, 162, 170, 178,
					3,    19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107,  123,                  155, 163, 171,
					4,  12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92,          124,       140,       156, 164, 172, 180,
					5,    13, 21,      53,            77, 93, 101,  125,   133, 141, 149,   157,    173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",         "Print Screen", "Scroll Lock", "Pause Break", "Logo",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",                        "Insert", "Home", "Page Up",       "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "[", "]", "\\",                               "Del", "End", "Page Down",         "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter",                                                          "Num 4", "Num 5", "Num 6",             //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift",                             "Up Arrow",               "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",  "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0],    [1, 0], [2, 0], [3, 0], [4, 0],    [6, 0], [7, 0], [8, 0], [9, 0],  [10, 0], [11, 0], [12, 0], 				 [14, 0], [15, 0], [16, 0],		[17, 0],
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],     [14, 1], [15, 1], [16, 1],		[17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2],    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],		[17, 2], [18, 2], [19, 2], [20, 2], //21
					[0, 3],    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],									[17, 3], [18, 3], [19, 3], //17
					[0, 4],  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],			  [15, 4],				[17, 4], [18, 4], [19, 4], [20, 4], // 18
					[0, 5], [1, 5], [2, 5],                      [6, 5],                        [10, 5], [11, 5],  [12, 5], [13, 5],		 [14, 5], [15, 5], [16, 5],		[17, 5],		  [19, 5],               // 13
				],
				Endpoint : { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-ii-nx.png"
			},
		};
	}
}

const ASUSdeviceLibrary = new deviceLibrary();
const ASUS = new ASUS_Keyboard_Protocol();

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}

export function Validate(endpoint) {
	return endpoint.interface === 1 || endpoint.interface === 2 || endpoint.interface === 3;
}

export function ImageUrl() {
	return "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png";
}
