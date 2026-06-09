import { Assert } from "@SignalRGB/Errors.js";
let savedPollTimer = Date.now();
const PollModeInternal = 15000;

/* global
LightingMode:readonly
forcedColor:readonly
idleTimeout:readonly
*/

export class AsusKeyboard{
	constructor() {
		this.Config = {
			DeviceProductID: 0x0000,
			DeviceName: "Asus Device",
			Leds: [],
			LedNames: [],
			LedPositions: [],
		};
	}

	getModelID() { return this.Config.ModelID; }
	setModelID(modelid) { this.Config.ModelID = modelid; }

	getDeviceName() { return this.Config.DeviceName; }
	setDeviceName(deviceName) { this.Config.DeviceName = deviceName; }

	getLedsPerPacket() { return this.Config.ledsPerPacket; }
	setLedsPerPacket(ledsperpacket) { this.Config.ledsPerPacket = ledsperpacket; }

	getLeds() { return this.Config.Leds; }
	setLeds(leds) { this.Config.Leds = leds; }

	getLedNames() { return this.Config.LedNames; }
	setLedNames(ledNames) { this.Config.LedNames = ledNames; }

	getLedPositions() { return this.Config.LedPositions; }
	setLedPositions(ledPositions) { this.Config.LedPositions = ledPositions; }

	getDeviceImage() { return this.Config.image; }
	setDeviceImage(image) { this.Config.image = image; }

	initializeAsus(modelId) {

		this.setDeviceName(keyboardLibrary.GetNameFromModel(modelId));

		const DeviceProperties = keyboardLibrary.GetMappingFromModel(modelId);

		if(DeviceProperties){
			this.setModelID(modelId);
			this.setLeds(DeviceProperties.vLeds);
			this.setLedNames(DeviceProperties.vLedNames);
			this.setLedPositions(DeviceProperties.vLedPositions);
			this.setDeviceImage(DeviceProperties.image);
			
			console.log(`Device model found: ` + this.getDeviceName());
			device.setName("ASUS " + this.getDeviceName());
			device.setSize(DeviceProperties.size);
			device.setControllableLeds(this.getLedNames(), this.getLedPositions());
			device.setImageFromUrl(this.getDeviceImage());

			device.addProperty({"property":"idleTimeout", "group":"", "label":"Device Sleep Timeout (Minutes)", description: "Enables the device to enter sleep mode", "type":"combobox", "values":["Off", "1", "2", "3", "5", "10",], "default":"3"});
			this.setIdleTimeout();

			device.addFeature("battery");
			this.modernFetchBatteryLevel();
		}else{
			device.notify("Unknown device", `Reach out to support@signalrgb.com, or visit our Discord to get it added.`, 0);
			console.log("Model not found in library!");
			console.log("Unknown protocol for "+ modelId);
		}
	}

	sendColors(overrideColor) {

		if(!this.getModelID()){
			return;
		}

		const deviceLeds = this.getLeds();
		const deviceLedPositions = this.getLedPositions();
		const TotalLEDs = deviceLeds.length;
		const RGBData = [];

		let TotalLedCount = TotalLEDs;

		for (let iIdx = 0; iIdx < TotalLEDs; iIdx++) {
			const iPxX = deviceLedPositions[iIdx][0];
			const iPxY = deviceLedPositions[iIdx][1];
			let color;

			if (overrideColor) {
				color = hexToRgb(overrideColor);
			} else if (LightingMode === "Forced") {
				color = hexToRgb(forcedColor);
			} else {
				color = device.color(iPxX, iPxY);
			}

			RGBData[iIdx * 4 + 0] = deviceLeds[iIdx];
			RGBData[iIdx * 4 + 1] = color[0];
			RGBData[iIdx * 4 + 2] = color[1];
			RGBData[iIdx * 4 + 3] = color[2];
		}

		while (TotalLedCount > 0) {
			const ledsPerPacket = 14;

			const ledsToSend = TotalLedCount >= ledsPerPacket ? ledsPerPacket : TotalLedCount;

			device.write([0x02, 0xC0, 0x81, ledsToSend, 0x00].concat(RGBData.splice(0, ledsToSend * 4)), 65);
			TotalLedCount -= ledsToSend;
		}
	}

	getDeviceBatteryStatus() {
		if(!this.getModelID()){
			return;
		}
		
		if (Date.now() - savedPollTimer < PollModeInternal) {
			return;
		}

		    savedPollTimer = Date.now();

		this.modernFetchBatteryLevel();
	}

	modernFetchBatteryLevel() {
		device.write([0x02, 0x12, 0x03], 64);
		device.pause(10);

		const returnpacket = this.sendPacketWithResponse([0x02, 0x12, 0x01]);

		if (!returnpacket || returnpacket.length < 10) {
			device.log("⚠️ Battery read failed or returned empty packet.");

			return;
		}

		const batteryLevel = returnpacket[6];
		const batteryState = returnpacket[9] + 1;

		device.log(`🔋 Battery: ${batteryLevel}% | State: ${keyboardLibrary.chargingStates[batteryState]}`);
		//TODO: Make this a dict
		battery.setBatteryLevel(batteryLevel);
		battery.setBatteryState(batteryState);
	}

	setIdleTimeout() {
		const timeMap = {
			1: 0x00,
			2: 0x01,
			3: 0x02,
			5: 0x03,
			10: 0x04,
			0: 0xFF // 0 = Off / disabled
		};

		// fallback if invalid value
		const encoded = timeMap.hasOwnProperty(idleTimeout) ? timeMap[idleTimeout] : 0x02;

		device.write([0x02, 0x51, 0x38, 0x00, 0x00, encoded], 64);
		device.pause(5);

		//save
		device.write([0x02, 0x50, 0x55, 0x00, 0x00], 64);
		device.pause(5);

		device.log(`🛌 Set idle timeout to ${idleTimeout === 0 ? "Off" : idleTimeout + " min"}`);
	}

	sendPacketWithResponse(packet) {
		device.clearReadBuffer();

		device.write(packet, 64);
		device.pause(10);

		const returnPacket = device.read(packet, 64);

		return returnPacket;
	}
}

export class AsusKeyboardLibrary {
	constructor() {
		this.modelLibrary = {
			"A23114802907": "ROG Azoth", // QWERTZ
			"A23114802908": "ROG Azoth", //Azoth X
			"A23114802909": "ROG Azoth", //Azoth Extreme
			"A22114900551": "ROG Azoth", // ?
			"R2MPGDD01967": "ROG Azoth", // QWERTY

			"A23114802911": "ROG Strix Scope NX", //II 96 RX Wireless
			"A23114802912": "ROG Strix Scope NX", //II 96 Wireless
			"D23120500771": "ROG Strix Scope II 96 Wireless",
			"D24090300614": "ROG Strix Scope II 96 Wireless",
			"D24031506880": "ROG Strix Scope II 96 Wireless",
			"D23099200513": "ROG Strix Scope II 96 Wireless",
			"D24061401333": "ROG Strix Scope II 96 Wireless",

			"A23114802919": "ROG Falchion", //ACE
			"A23114802920": "ROG Falchion", //ACE HFX
			"024050670802": "ROG Falchion RX", // Low profile
			"024050670806": "ROG Falchion RX", // Low profile
			"025052319401": "ROG Azoth Extreme", // Azoth Extreme
		};
		this.ledLibrary = {
			"ROG Azoth":
			{
				size: [15, 6],
				vLeds: [
					0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,   //13
					1, 9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 121, //15
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 107, 122, //15
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 123, //14
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 116, 124, //15
					5, 13, 21, 53, 85, 93, 101, 109, 117, 125, //10
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",    //13
					"^", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "ß", "`", "Backspace", "Ins", //15
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
					[0, 5], [1, 5], [2, 5], [5, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],  //10
				],
				Endpoint: { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/azoth.png"
			},
			"ROG Azoth Extreme":
			{
				size: [15, 6],
				vLeds:[
					0,  8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, //13
					1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97,	105, 121, //15
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98,	106, 122, //15
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99,	107, 123, //15
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100,	116, 124, //15
					5, 13, 21,			   53,		  85, 93, 101, 109, 117, 125 //10
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", //13
					"`", "1",  "2", "3", "4", "5",  "6", "7", "8", "9", "0",  "-",   "+",  "Backspace",	"Ins", //15
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", "Del", //15
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "ISO #", "Enter", "PgUp", //15
					"Left Shift", "ISO <", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow", "PgDn", //15
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Menu", "Right Ctrl", "Left Arrow",  "Down Arrow", "Right Arrow" //10
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], //13
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], //15
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], //15
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], //15
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], //15
					[0, 5], [1, 5], [2, 5],			  		[6, 5],			  				[9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], //10
				],
				Endpoint : { "interface": 2, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/azoth.png"
			},
			"ROG Falchion":
			{
				size: [15, 5],
				vLeds: [
					0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112,
					1, 9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 113,
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 114,
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107, 115,
					4, 12, 20, 52, 76, 84, 92, 100, 108, 116,
				],
				vLedNames: [
					"Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "Insert",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",				 /*EntTop*/					"Del",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter", "Page Up",
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift", "Up Arrow", "Page Down",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow",
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0],   //15
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],   //14
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],   //15
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3],   //15
					[0, 4], [1, 4], [2, 4], [6, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],    //10
				],
				Endpoint: { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/falchion.png"
			},
			"ROG Falchion RX":
			{
				size: [15, 5],
				vLeds:[
					1, 9,  17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 113,
					2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 114,
					3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107, 115,
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116,
					5, 13, 21,         53,				77, 85, 93, 101, 109, 117,
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
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/falchion-rx.png"
			},
			"ROG Strix Scope NX":
			{
				size: [21, 6],
				vLeds: [
					0, 24, 32, 40, 48, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 168, 176,
					1, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 121, 129, 137, 145, 153, 161, 169, 177,
					2, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 122, 130, 138, 146, 154, 162, 170, 178,
					3, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91, 99, 107, 123, 155, 163, 171,
					4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 124, 140, 156, 164, 172, 180,
					5, 21, 29, 53, 77, 93, 101, 125, 133, 141, 149, 157, 173,
				],
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Print Screen", "Scroll Lock", "Pause Break", "ROG1", "ROG2",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "Insert", "Home", "Page Up", "NumLock", "Num /", "Num *", "Num -",  //21
					"Tab", "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "[", "]", "\\", "Del", "End", "Page Down", "Num 7", "Num 8", "Num 9", "Num +",    //21
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "/", "Enter", "Num 4", "Num 5", "Num 6",             //17
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "ISO_#", "Right Shift", "Up Arrow", "Num 1", "Num 2", "Num 3", "Num Enter", //18
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num ."                       //13
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0],       //18
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], [18, 1], [19, 1], [20, 1], //21
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], [18, 2], [19, 2], [20, 2], //21
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [17, 3], [18, 3], [19, 3], //17
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [15, 4], [17, 4], [18, 4], [19, 4], [20, 4], // 18
					[0, 5], [1, 5], [2, 5], [6, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], [19, 5],               // 13
				],
				Endpoint: { "interface": 1, "usage": 0x0001, "usage_page": 0xFF00, "collection": 0x0000 },
				image: "https://assets.signalrgb.com/devices/brands/asus/keyboards/strix-scope-rx.png"
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

		};

		this.chargingStates = Object.freeze({
			1: "Discharging",
			2: "Charging",
			3: "Fully Charged",
		});
	}

	GetNameFromModel(modelId) {
		if(modelId in this.modelLibrary) {
			device.log("Found Valid Keyboard Name Mapping!");

			return this.modelLibrary[modelId];
		}

		Assert.isOk(this.modelLibrary[modelId], `Unknown Device ID: [${modelId}]. Reach out to support@signalrgb.com, or visit our Discord to get it added.`);

		return "Unknown Device";
	}

	GetMappingFromModel(modelId) {
		if(modelId in this.modelLibrary) {
			device.log("Found Valid Keyboard Layout Mapping!");

			const modelName = this.modelLibrary[modelId];

			if(modelName in this.ledLibrary) {
				return this.ledLibrary[modelName];
			}

			return {};
		}

		return {};
	}
}

const keyboardLibrary = new AsusKeyboardLibrary();

export function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}