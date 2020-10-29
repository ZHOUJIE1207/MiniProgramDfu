//固件升级
const crc = require('../../utils/crc32');
const littleEndianUtils = require('../../utils/little_endian_utils');
const bleUtils = require('../../utils/bleUtils.js');


const STEP = {
  DOWNFILE: 1,
  UNZIPFILE: 2,
  SCANDEVICE: 3,
  RESULT:4
};

//这个是防止ios 重复连接 
let connectState = false;
let connectting = false;
// 升级成功后蓝牙不需要连接
let UpdateState = false;


// Control point procedure opcodes.
const CONTROL_OPCODES = {
  CREATE: 0x01,
  SET_PRN: 0x02,
  CALCULATE_CHECKSUM: 0x03,
  EXECUTE: 0x04,
  SELECT: 0x06,
  RESPONSE_CODE: 0x60,
};

const OPCODES = {
  SEND_QUERY_DEV_INFO: 0x01,
  RES_QUERY_DEV_INFO: 0x02,
  SEND_UPDATE_START: 0x03,
  RES_UPDATE_START: 0x04,
  SEND_BLOCK_DATA: 0x05,
  RECV_RETRANSFER_REQ: 0x06,
  SEND_TRANS_END: 0x07,
  RES_TRANS_END: 0x08,
  SEND_REBOOT: 0xB0,
};

const CONTROL_PARAMETERS = {
  COMMAND_OBJECT: 0x01,
  DATA_OBJECT: 0x02,
  // size: Object size in little endian, set by caller.
  // vale: Number of packets to be sent before receiving a PRN, set by caller. Default == 0.
};
const BLE_PACKET_SIZE = 20;

// Index of response value fields in response packet.
const BASE_POS = 3;

const CALCULATE_CHECKSUM_RESPONSE_FIELD = {
  OFFSET: BASE_POS + 0,
  CRC32: BASE_POS + 4,
};

const SELECT_RESPONSE_FIELD = {
  MAXIMUM_SIZE: BASE_POS + 0,
  OFFSET: BASE_POS + 4,
  CRC32: BASE_POS + 8,
};

// Possible result codes sent in the response packet.
const RESULT_CODES = {
  INVALID_CODE: 0x00,
  SUCCESS: 0x01,
  OPCODE_NOT_SUPPORTED: 0x02,
  INVALID_PARAMETER: 0x03,
  INSUFFICIENT_RESOURCES: 0x04,
  INVALID_OBJECT: 0x05,
  UNSUPPORTED_TYPE: 0x07,
  OPERATION_NOT_PERMITTED: 0x08,
  OPERATION_FAILED: 0x0A,
};

const reverseLookup = obj => val => {
  for (const k of Object.keys(obj)) {
    if (obj[k] === val) {
      return k;
    }
  }
  return 'UNKNOWN';
};

const controlOpCodeToString = reverseLookup(CONTROL_OPCODES);
const resultCodeToString = reverseLookup(RESULT_CODES);
console.log(controlOpCodeToString);


let expectedCRC;


let imageBuf;
let total, count = 0;
let bin_offset = 0;
const binFilename = "JD-V10_BETA_OTA_0308.bin";
const UUID_OTA_SERVICE = 'F000FFC0-0451-4000-B000-000000000000';
const UUID_TX = 'F000FFC1-0451-4000-B000-000000000000';
const UUID_RX = 'F000FFC2-0451-4000-B000-000000000000';
let frameSeq = 0x00;
let sendReady = true;
const FRAME_SIZE = 20;
const DATA_HEADER_SIZE = 8;
const BLOCK_SZIE = FRAME_SIZE - 8;
const DATA_SIZE = BLOCK_SZIE + 4;
let DATA_ADDR = 0 ;
let offset =0;
const DATA_DELAY_TIME = 50;
let bin1Offset = 0;
let bin2Offset = 0;
let bin1Length = 0;
let bin2Length = 0;
let frameLastFreq = 0;
let lastAddr = 0;
let selectBin = 0;

Page({


  data: {

    processData: [{
        name: '下载固件',
        start: '#fff',
        end: '#EFF3F6',
        icon: '../../img/process_1.png'
      },
      {
        name: '校验数据',
        start: '#EFF3F6',
        end: '#EFF3F6',
        icon: '../../img/process_1.png'
      },
      {
        name: '传输固件',
        start: '#EFF3F6',
        end: '#EFF3F6',
        icon: '../../img/process_1.png'
      },
      {
        name: '升级结束',
        start: '#EFF3F6',
        end: '#fff',
        icon: '../../img/process_1.png'
      }
    ],
    disable:false,
    controlPointCharacteristicUUID: '8EC90001-F315-4F60-9FB8-838830DAEA50',
    packetCharacteristicUUID: '8EC90002-F315-4F60-9FB8-838830DAEA50',
    loadingHidden: true,
    bin_data: '',
    dat_data: '',
    device: '',
    bin_offset: '',
    total: 0,
    count: 0,
    percentage: 0

  },
  //事件处理函数
  updateLockNewViewsion2: function() { // mark: updateLockNewViewsion2

   //检查任务进度
    var that = this;
    that.loadFile();
    // that.unzip(); // 默认下载了文件去解压
  },
  onLoad: function() {

  },
  callbackStep: function(step, result) {
    var that = this;
      switch (step) {
        case STEP.DOWNFILE: // 去下载固件
          that.setPeocessIcon(STEP.DOWNFILE)
          console.log("下载")
          that.downfirmware()
         
          break;
        case STEP.UNZIPFILE: // 去解压
          that.setPeocessIcon(STEP.UNZIPFILE)
          console.log("解压")
          // that.unzip();
          that.loadFile();
         
          break;
        case STEP.SCANDEVICE:
          that.setPeocessIcon(STEP.SCANDEVICE)
          console.log("扫描")
          if(!UpdateState){
            that.scanDevice();
          }
          
          break;
        case STEP.RESULT:
          that.setPeocessIcon(STEP.RESULT)
          console.log("升级结果")
          UpdateState = true
          that.setData({disable:true})
          break;

      }
  },
  downfirmware: function() { // mark: downfirmware
    const filemgr = wx.getFileSystemManager()
    const targetPath = wx.env.USER_DATA_PATH
    console.log(targetPath);
    wx.showLoading({
      title: '正在下载...',
    })
    let that = this;
    wx.downloadFile({
      //url: 'https://www.echipfoundry.com/static/firmware/JD-V10_TEST_0210.bin',
      // url:'https://file.ykt56.cn/5e4ca027e0e07bcc8efa.bin/JD-V10_TEST_0210.bin',
      // url:'https://file.ykt56.cn/259c2a2667467319cfa0.bin/JD-V10_TEST_OTA_0325.bin',
      url:'https://file.ykt56.cn/95543fe204c739100785.bin/JD-V10_BETA_OTA_0308.bin',
      success: function(res) {
        wx.saveFile({
          tempFilePath: res.tempFilePath,
          filePath: targetPath + "/" + binFilename,
          success: function(result) {

            console.log(JSON.stringify(result))
            wx.showToast({
              title: '下载成功',
              icon: 'success',
            })
            that.callbackStep(STEP.UNZIPFILE, true)
          },
          fail: function(e) {
            console.info("保存一个文件失败");
            if (fail) {
              fail(e);
              wx.showModal({
                title: '提示',
                content: '连接失败，' + str,
                confirmText: '重试',
                success: function(res) {
                  if (res.confirm) {
                    that.downfirmware()
                  }
                }
              })
            }
          }
        })
      }
    }) 
  },
  //解压文件
  unzip: function() {
    var that = this;
    const filemgr = wx.getFileSystemManager()
    const targetPath = wx.env.USER_DATA_PATH
    filemgr.unzip({
      zipFilePath: targetPath + "/firmware.zip",
      targetPath: targetPath,
      success: function(unzipRes) {
        console.log("解压成功:" + JSON.stringify(unzipRes))
        filemgr.readFile({
          filePath: targetPath + '/manifest.json',
          encoding: 'binary',
          complete: function(readFileRes) {
            console.log(JSON.stringify(readFileRes));
            filemgr.readFile({
              filePath: targetPath + "/nrf52832_xxaa.dat",
              complete: function(datRes) {
                var dat_data = that.ab2hex(datRes.data)
                expectedCRC = crc.crc32(datRes.data);
                console.log(expectedCRC + " 长度：" + datRes.data.byteLength);
                that.setData({
                  dat_data: datRes.data,
                })

              }
            })

            filemgr.readFile({
              filePath: targetPath + "/nrf52832_xxaa.bin",
              complete: function(binRes) {
                var bin_data = that.ab2hex(binRes.data)
                expectedCRC = crc.crc32(binRes.data);
                console.log(expectedCRC + " 长度：" + binRes.data.byteLength);
                imageBuf = binRes.data;
                total = parseInt(imageBuf.byteLength / 4096) + 1;
                console.log(total);
                that.setData({
                  bin_data: binRes.data,
                })

              }
            })

            that.callbackStep(STEP.SCANDEVICE, true)

          }
        })
      },
      fail: function(unzipRes) {

        console.log("解压失败:" + JSON.stringify(unzipRes))
        that.callbackStep(STEP.DOWNFILE, false)
      }
    })
  },
  loadFile:function(){ // mark: loadFile
    var that = this;
    const filemgr = wx.getFileSystemManager()
    const targetPath = wx.env.USER_DATA_PATH
    let path = targetPath + "/" +binFilename
    console.log("path="+path);
    filemgr.getFileInfo({
      filePath:path,
      success (res) {
        console.log(res.size)
        console.log(res.digest)
      }
    })
    filemgr.readFile({
      filePath: path.toString(),
      complete: function(binRes) {
        // console.log('binRes='+binRes.data[0])
        // var buf = new Uint8Array(binRes.data);
        // console.log('buf:',buf)
        // var bin_data = that.ab2hex(binRes.data)
        // console.log('binRes='+binRes)
        expectedCRC = crc.crc32(binRes.data);
        console.log(expectedCRC + " 长度：" + binRes.data.byteLength);
        // imageBuf = binRes.data;
        // total = parseInt(imageBuf.byteLength / 4096) + 1;
        // console.log(total);
        that.setData({
          bin_data:binRes.data ,
        })
        that.getHeaderData(binRes.data);
        that.callbackStep(STEP.SCANDEVICE, true)
        
      },
      fail: function(unzipRes) {
        console.log("读取文件失败:" + JSON.stringify(unzipRes))
        that.callbackStep(STEP.DOWNFILE, false)
      }
    })
  },
  //扫描设备
  scanDevice: function() {
    var that = this;
    bleUtils.openBluetoothAdapter({}).then(function(res) { //初始化蓝牙模块儿
      console.log('openBluetoothAdapter='+JSON.stringify(res));
      return bleUtils.getBluetoothAdapterState({}) //获取适配器状态
    }).then(function(res) {
      console.log('getBluetoothAdapterState='+JSON.stringify(res));
      if (res.available) { //蓝牙可用
        bleUtils.startBluetoothDevicesDiscovery({
          // services: ["F000FFC0"], //过滤，只搜索微信硬件设备
          allowDuplicatesKey: true,
          interval: 0.1
        }).then(function(res) {
          console.log('startBluetoothDevicesDiscovery='+JSON.stringify(res));  
          that.bleCallback()

        })
      }
    })
  },
  bleCallback: function() {
    var that = this;
    bleUtils.onBluetoothAdapterStateChange(function(res) { //蓝牙转态回调
        if (!res.available) {
          wx.showModal({
            title: '提示',
            content: '请检查手机蓝牙是否打开',
            showCancel: false,
          })
          setTimeout(() => {
            that.callbackStep(STEP.SCANDEVICE, false);
          }, 2000)
         
        }
      
      }),
      bleUtils.onBLEConnectionStateChange(function(res) { //链接状态回调

        if (!res.connected) {
          wx.showToast({
            title: '蓝牙已断开'
          })
          connectState = false;
          connectting = false;
          console.log("蓝牙已断开")
          setTimeout(function(){
            if(!UpdateState){ //升级成功就不用了
              that.callbackStep(STEP.SCANDEVICE, false);
            }
          
          },3000)
         
        }
      })
    bleUtils.onBluetoothDeviceFound(function(devices) {
      //搜索到的蓝牙设备回调，对应可以将相关信息显示在界面上
      var devices = devices.devices;
      var selectDev = {};
      var find = false;
      console.log('new device list has founded')
      console.dir(devices)
      if (devices) {
        wx.showLoading({
          title: '正在连接...',
        })

        for (var i in devices) {
          var dev = devices[i];
          console.log("获取设备-->:" + JSON.stringify(dev))
          var devName = dev['name'];
  
          //官方
          if (devName.indexOf('JD-') != -1) {
            console.log('find dev');
            find = true;
            selectDev = dev;
            break;
          }
        }

        if(find){
          // bleUtils.stopBluetoothDevicesDiscovery({})
          var deviceId = selectDev['deviceId'];
          console.log("长度：" + devices.length + " " + JSON.stringify(selectDev) + "  deviceId:  " + deviceId);
          if (!connectState && !connectting) {
          that.connectDfuDevice(selectDev);
          }
        }

        
        // var ori_mac = "D7BB321D93A0"
        // var data16 = that.ab2hex(devices[0].advertisData).toLocaleUpperCase()

        // console.log(" data16: " + data16);
        // console.log("长度：" + devices.length + " " + JSON.stringify(devices[0]) + "  deviceId:  " + deviceId);
        
        // var name = devices[0]['name'];
        // var localName = devices[0]['localName'];
        // if (name || localName) {
        //   console.log("name：" + name + " localname:" + localName + " 有没有：" + localName.indexOf("DFU").toString() + "  " + name.indexOf("DFU").toString() + " 连接状态：" + connectState + " 是否已经连接" + connectting);

        //   if ((localName && localName.indexOf("DFU").toString() != -1) && (name && name.indexOf("DFU").toString() != -1)) {
        //     if (ori_mac == data16 && !connectState && !connectting) {

        //       // that.connectDfuDevice(devices[0]);
        //     }

        //   } else {
        //     var mac = data16.substr(4, 12);
        //     console.log("ori_mac:  " + ori_mac + "   mac: " + mac);
        //     if (ori_mac == mac && !connectState && !connectting) {
        //       // that.connectDevice(devices[0]);
        //     }

        //   }
        // }

      }

    })
    bleUtils.onBLECharacteristicValueChange(function(res) {
       that.notifyHandle(res);
    } )
  },
  //链接设备在特征值90003并写入0x01指令
  connectDevice: function(device) {
    var that = this
    console.log("连接普通设备");
    connectting = true;
    bleUtils.createBLEConnection({
      deviceId: device.deviceId,
      timeOut: 5000
    }).then(function(res) {
      //设备链接成功后记得停止扫描
      bleUtils.stopBluetoothDevicesDiscovery({})
      connectState = true;
      connectting = false;
      return bleUtils.getBLEDeviceServices({ //获取设备对应的服务
        deviceId: device.deviceId
      })

    }).then(function(res) {
      console.log("获取设备对应的服务:" + JSON.stringify(res))

      for (var i in res.services) {
        var service = res.services[i]
        console.log("获取设备服务-->:" + JSON.stringify(service))
        var uuid = service.uuid

        //官方
        if (uuid.indexOf('FE59-') != -1) {
          device.serverFE59 = service
          break;
        }
      }

      console.log("获取设备对应的服务fee7:" + JSON.stringify(device))
      return bleUtils.getBLEDeviceCharacteristics({ //获取特征值
        deviceId: device.deviceId,
        serviceId: device.serverFE59["uuid"]
      })
    }).then(function(res) {
      for (var i in res.characteristics) {
        var ch = res.characteristics[i]
        if (ch.uuid.indexOf("8EC90003-") != -1) {
          device.characteristic90003 = ch
        }
      }
      console.log("特征值：" + JSON.stringify(device))

      console.log("90003:" + device.characteristic90003["uuid"]);
      return bleUtils.notifyBLECharacteristicValueChange({ //开启90003的notify
        deviceId: device.deviceId,
        serviceId: device.serverFE59["uuid"],
        characteristicId: device.characteristic90003["uuid"],
        state: true
      })


    }).then(function(res) {
      console.log(JSON.stringify(res))

      let buffer = new ArrayBuffer(1)
      let dataView = new DataView(buffer)
      dataView.setUint8(0, 0x01)
      return that.bleWriteTo90003(device, dataView, buffer) //

    }).then(function(res) { //关闭蓝牙
      setTimeout(() => {
        bleUtils.closeBLEConnection({
          deviceId: device.deviceId
        })
        bleUtils.closeBluetoothAdapter({}) //关闭adapter,否则后面会在部分Android机上搜不到dfu
        wx.hideLoading()
        wx.showToast({
          title: '连接成功，门锁即将进入dfu模式，蓝牙会重新连接',
          icon: 'success',
        })
        connectting = false;
        //接下来门锁进入dfu 模式,蓝牙会自动断开
        //that.callbackStep(STEP.SCANDEVICE, true)
      }, 1000)


    })
  },
  connectDfuDevice: function(device) {
    let self = this
    connectting = true;
    bleUtils.createBLEConnection({
      deviceId: device.deviceId,
      timeOut: 5000
    }).then(function(res) {
      //设备链接成功后记得停止扫描
      console.log(" 链接成功" + JSON.stringify(res));
      connectState = true;
      connectting = false;
      bleUtils.stopBluetoothDevicesDiscovery({})

      return bleUtils.getBLEDeviceServices({
        deviceId: device.deviceId
      })
    }).then(function(res) {
      var findService = false;  
      console.log("获取设备对应的服务:" + JSON.stringify(res))
      for (var i in res.services) {
        var service = res.services[i]
        console.log("获取设备服务-->:" + JSON.stringify(service))
        var uuid = service.uuid
        if(uuid == UUID_OTA_SERVICE) {
        // if (uuid.indexOf(UUID_OTA_SERVICE) != -1) {
          console.log('find service');
          findService = true;
          break;
        }
      }
      return bleUtils.getBLEDeviceCharacteristics({ //获取服务fe59对应的特征值90001和90002
        deviceId: device.deviceId,
        serviceId: UUID_OTA_SERVICE,
      })
    }).then(function(res) {
      var findTX = false;
      var findRx = false;
      for (var i in res.characteristics) {
        var c = res.characteristics[i]
        console.log("获取特性-->:" + JSON.stringify(c))
        // if (c.uuid == self.data.controlPointCharacteristicUUID) { //8EC90001-F315-4F60-9FB8-838830DAEA50
        //   device.characteristic90001 = c
        // }
        // if (c.uuid == self.data.packetCharacteristicUUID) { //8EC90002-F315-4F60-9FB8-838830DAEA50
        //   device.characteristic90002 = c
        // }
        if(c.uuid == UUID_TX){
          console.log('characteristic TX find');
          findTX = true;
          // break;
        }
        if(c.uuid == UUID_RX){
          console.log('characteristic RX find');
          findRx = true;
          // break;
        }
      }
      if(findTX && findRx){
        self.setData({
          device: device
        })
        // console.log("90001:" + device.characteristic90001["uuid"]);
      return bleUtils.notifyBLECharacteristicValueChange({ //开启90001的notify
        deviceId: device.deviceId,
        serviceId: UUID_OTA_SERVICE,
        characteristicId: UUID_RX,
        state: true
      })
      }
    }).then(function(res) {

      console.log("启动通知：" + JSON.stringify(res)); // mark: connectDfuDevice
      // 传输init packet
      let buffer = new ArrayBuffer(4)
      let dataView = new DataView(buffer)
      // 写入通道指令 
      dataView.setUint8(0, 0x01) //这里也能写十进制数
      dataView.setUint8(1, 0x00) //...
      dataView.setUint8(2, 0x00)
      dataView.setUint8(3, 0x00)
      setTimeout(() => {
        // First, select the Command Object. As a response the maximum command size and information whether there is already
        // return self.bleWriteTo90001(device, dataView, buffer) //
        self.printSendData(dataView);
        return bleUtils.writeBLECharacteristicValue({
          deviceId: device.deviceId,
          serviceId: UUID_OTA_SERVICE,
          characteristicId: UUID_TX,
          value: buffer
        })
      }, 0)


    // }).then(function(res) {

      // return bleUtils.onBLECharacteristicValueChange(function(res) {
      //   console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));

      //   wx.showLoading({
      //     title: '数据校验...',
      //   })
      //   self.notifyHandle(res);
      //   // self.controlPointNotificationHandler(res);
      //   // var data = self.ab2hex(res.value)
      //   // console.log(data);
      //   // var max = data.substr(6, 8)

      //   // var offset = data.substr(14, 8)

      //   // var crc = data.substr(22, 8)
      //   // if (data) {
      //   //   console.log("Max size = " + parseInt(self.data2Array(max), 16) + ", Offset = " + parseInt(self.data2Array(offset), 16) + ", CRC = " + parseInt(self.data2Array(crc), 16));
      //   // }
      //   // console.log("data:" + data + " length:" + data.length);
      // })
      
    }).then(function(res) {

      console.log(JSON.stringify(res));
    })
  },
  //向90001写入数据
  bleWriteTo90001: function(device, dataView, buffer) {
    console.log("90001发送的数据：")
    for (let i = 0; i < dataView.byteLength; i++) {
      console.log("0x" + dataView.getUint8(i).toString(16))
    }

    return bleUtils.writeBLECharacteristicValue({
      deviceId: device.deviceId,
      serviceId: device.serverFE59["uuid"],
      characteristicId: device.characteristic90001["uuid"],
      value: buffer
    })
  },
  //向90003写入数据
  bleWriteTo90003: function(device, dataView, buffer) {
    console.log("90003发送的数据：")
    for (let i = 0; i < dataView.byteLength; i++) {
      console.log("0x" + dataView.getUint8(i).toString(16))
    }

    return bleUtils.writeBLECharacteristicValue({
      deviceId: device.deviceId,
      serviceId: device.serverFE59["uuid"],
      characteristicId: device.characteristic90003["uuid"],
      value: buffer
    })
  },
  /**
   * 二进制转成16进制
   */
  ab2hex: function(buffer) {
    var hexArr = Array.prototype.map.call(
      new Uint8Array(buffer),
      function(bit) {
        return ('00' + bit.toString(16)).slice(-2)
      }
    )
    return hexArr.join('');
  },
  data2Array: function(data) {
    var redata = ''
    for (var i = data.length - 1; i > 0; i = i - 2) {
      redata += data.substr(i - 1, 2)
    }
    return redata;
  },
  parseResponse: function(response) {
    var response = new DataView(response);
    const responseCode = response.getUint8(0);
    const responseOpCode = response.getUint8(1);
    const resultCode = response.getUint8(2);
    let responseSpecificData;

    console.log(response + " responseCode:" + responseOpCode);

    if (responseCode !== CONTROL_OPCODES.RESPONSE_CODE) {
      throw new Error(`Unexpected response code received: ${controlOpCodeToString(responseCode)}.`);
    }
    if (resultCode !== RESULT_CODES.SUCCESS) {
      throw new Error(`Error in result code: ${resultCodeToString(resultCode)}.`);
    }

    switch (responseOpCode) {
      case CONTROL_OPCODES.CREATE:
        break;
      case CONTROL_OPCODES.SET_PRN:
        break;
      case CONTROL_OPCODES.CALCULATE_CHECKSUM:
        responseSpecificData = {
          offset: littleEndianUtils.littleEndianUInt32(response.getUint32(CALCULATE_CHECKSUM_RESPONSE_FIELD.OFFSET)), // mark: littleEndianUInt32
          crc32: littleEndianUtils.littleEndianUInt32(response.getUint32(CALCULATE_CHECKSUM_RESPONSE_FIELD.CRC32)),
        };
        break;
      case CONTROL_OPCODES.EXECUTE:
        break;
      case CONTROL_OPCODES.SELECT:
        responseSpecificData = {
          maximumSize: littleEndianUtils.littleEndianUInt32(response.getUint32(SELECT_RESPONSE_FIELD.MAXIMUM_SIZE)),
          offset: littleEndianUtils.littleEndianUInt32(response.getUint32(SELECT_RESPONSE_FIELD.OFFSET)),
          crc32: littleEndianUtils.littleEndianUInt32(response.getUint32(SELECT_RESPONSE_FIELD.CRC32)),
        };
        break;
      default:
        throw new Error(`Unknwon response op-code received: ${controlOpCodeToString(responseOpCode)}.`);
    }

    return {
      responseCode: responseCode,
      responseOpCode: responseOpCode,
      resultCode: resultCode,
      data: responseSpecificData,
    };
  },
  controlPointNotificationHandler: function(event) { // mark: controlPointNotificationHandler
    var that = this;
    const response = event.value;
    const parsedResponse = that.parseResponse(response);
    const responseOpCode = parsedResponse.responseOpCode;

    console.log(parsedResponse);

    switch (responseOpCode) {
      case CONTROL_OPCODES.CREATE:
        console.log('CREATE');

        that.sendPRN()

        break;
      case CONTROL_OPCODES.SET_PRN:
        console.log('SET_PRN');
        var device = that.data.device;
        var dat_data = that.data.dat_data
        that.writeBleDat(device, dat_data, 0)


        break;
      case CONTROL_OPCODES.CALCULATE_CHECKSUM:
        console.log('CALCULATE_CHECKSUM');
        // TODO: Check if offset and crc is correct before executing.
        that.sendEXECUTE();

        break;
      case CONTROL_OPCODES.EXECUTE:
        console.log('EXECUTE');

        var buffer = new ArrayBuffer(2)
        var dataView = new DataView(buffer)
        dataView.setUint8(0, CONTROL_OPCODES.SELECT)
        dataView.setUint8(1, CONTROL_PARAMETERS.DATA_OBJECT)
        var device = that.data.device

        return that.bleWriteTo90001(device, dataView, buffer)
          .then(function(res) {

            return bleUtils.onBLECharacteristicValueChange(function(res) {
              console.log(" EXECUTE:" + JSON.stringify(res));
              console.log("value  " + that.ab2hex(res.value));
              that.dataEventListener(res);

            })
          })

        break;
      case CONTROL_OPCODES.SELECT:
        console.log('controlPointNotificationHandler->SELECT');
        // TODO: Some logic to determine if a new object should be created or not.
        var skipSendingInitPacket = false;
        var resumeSendingInitPacket = false;
        var dat_data = that.data.dat_data;
        console.log("init包长度：" + dat_data.byteLength + " offset:" + parsedResponse.data.offset);
        if (parsedResponse.data.offset > 0 && parsedResponse.data.offset <= dat_data.byteLength) {
          if (parsedResponse.data.offset == dat_data.byteLength) {
            skipSendingInitPacket = true;
          } else {
            resumeSendingInitPacket = true;
          }
        }
        if (parsedResponse.data.offset == 0 && !skipSendingInitPacket) {
          that.sendCreate();
          return;
        }
        that.sendEXECUTE();
        break;
      default:
        throw new Error(`Unknwon response op-code received: ${controlOpCodeToString(responseOpCode)}.`);
    }
  },
  notifyHandle:function(res){ // mark: notifyHandle
    let that = this;
    var data = new DataView(res.value);
    const responseCode = data.getUint8(0);
   
    let responseSpecificData;

    console.log(data + " responseCode:" + responseCode);

    switch (responseCode) {
      case OPCODES.RES_QUERY_DEV_INFO:
        console.log("VID="+data.getUint8(4).toString(16)+" "+data.getUint8(5).toString(16));
        console.log("PID="+data.getUint8(6).toString(16)+" "+data.getUint8(6).toString(16));
        console.log("VER="+data.getUint8(8).toString(16)+" "+data.getUint8(9).toString(16));
        console.log("Reserved="+data.getUint8(10).toString(16));
        let resver = data.getUint8(10);
        if(resver == 1) 
          selectBin = 2;
        else if(resver == 2) 
          selectBin =1;
       else
         console.log("Reserved值不合法????")
        console.log("selectBin="+selectBin);
        that.cmdProduceFunction(OPCODES.SEND_UPDATE_START);
        break;
     case OPCODES.RES_UPDATE_START:
      console.log("result="+data.getUint8(4).toString(16));
      console.log("addr="+data.getUint8(5).toString(16)+" "+data.getUint8(6).toString(16)+" "+data.getUint8(7).toString(16)+" "+data.getUint8(8).toString(16));
      console.log("length="+data.getUint8(9).toString(16)+" "+data.getUint8(10).toString(16)+" "+data.getUint8(11).toString(16)+" "+data.getUint8(12).toString(16));
      console.log("size="+data.getUint8(13).toString(16)+" "+data.getUint8(14).toString(16));
      let addr = littleEndianUtils.littleEndianUInt32(data.getUint32(5));
      console.log("addr="+addr);
      DATA_ADDR = addr;
      offset = addr;
      that.cmdProduceFunction(OPCODES.SEND_BLOCK_DATA);
        break;
        case OPCODES.RECV_RETRANSFER_REQ:
          console.log("recv resend request")
          console.log("framreq="+data.getUint8(1).toString(16));
          console.log("addr="+data.getUint8(4).toString(16)+" "+data.getUint8(5).toString(16)+" "+data.getUint8(6).toString(16)+" "+data.getUint8(7).toString(16));
          let resendAddr = littleEndianUtils.littleEndianUInt32(data.getUint32(4));
          frameSeq = data.getUint8(1) + 1;
          DATA_ADDR = resendAddr;
          offset = resendAddr;
          break;
        case OPCODES.RES_TRANS_END:
          console.log("result="+data.getUint8(4).toString(16));
          let result = data.getUint8(4);
          if(result == 0x00){
            console.log("升级成功")
            that.cmdProduceFunction(OPCODES.SEND_REBOOT);
          }else{
            console.log("升级失败")
          }
            break;
      default:
        throw new Error(`Unknwon response op-code received: ${controlOpCodeToString(responseOpCode)}.`);
    }
  },
  dataEventListener: function(event) {

    const response = event.value;

    var that = this;
    const parsedResponse = that.parseResponse(response);
    const responseOpCode = parsedResponse.responseOpCode;

    console.log(parsedResponse);

    var device = that.data.device;
    var binData = that.data.bin_data;
    switch (responseOpCode) {
      case CONTROL_OPCODES.CREATE:

        console.log('CREATE(' + count + "/" + total + ")");
        setTimeout(function() {
          that.writeBleBin(device, imageBuf.slice(0, 0x1000), 0)
          expectedCRC = crc.crc32(imageBuf.slice(0, 0x1000));
          console.log("expectedCRC ->  " + expectedCRC + "  length " + imageBuf.byteLength);
        }, 500)

        break;
      case CONTROL_OPCODES.SET_PRN:
        console.log('SET_PRN');
        break;
      case CONTROL_OPCODES.CALCULATE_CHECKSUM:
        console.log('CALCULATE_CHECKSUM');

        count = parsedResponse.data.offset / 4096 //计数一下发到第几页
        if (parsedResponse.data.offset == binData.byteLength) {
          count = total;
        }
        bin_offset = parsedResponse.data.offset;
        console.log(" 对比crc:" + parsedResponse.data.crc32 + " binCrc:" + crc.crc32(binData.slice(0, 4096 * count)));
        if (parsedResponse.data.crc32 != crc.crc32(binData.slice(0, 4096 * count))) {
          var remainLength = binData.byteLength - parsedResponse.data.offset
          if (remainLength < 0x1000) {
            that.sendCreatePackage(that.formater4length(remainLength));
          } else {
            that.sendCreatePackage(that.formater4length(0x1000));
          }

          return;
        }
        //校验通过才发送执行命令
        console.log("发送通过")
        imageBuf = imageBuf.slice(0x1000);
        let buffer = new ArrayBuffer(1)
        let dataView = new DataView(buffer)
        //写入通道指令 
        dataView.setUint8(0, CONTROL_OPCODES.EXECUTE)
        return that.bleWriteTo90001(device, dataView, buffer)
          .then(function(res) {

            return bleUtils.onBLECharacteristicValueChange(function(res) {
              console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
              console.log(" value: " + that.ab2hex(res.value));

              that.dataEventListener(res);

            })
          })
        break;
      case CONTROL_OPCODES.EXECUTE:
        console.log('EXECUTE');

        if (count != total) { // 如果是校验已经发完了，就不用在创建发送命令

          var remainLength = binData.byteLength - bin_offset
          if (remainLength < 0x1000) {
            that.sendCreatePackage(that.formater4length(remainLength));
          } else {
            that.sendCreatePackage(that.formater4length(0x1000));
          }
        }else{
          that.setData({
            loadingHidden: true
          })
          wx.showToast({
            title: '升级成功',
            icon: 'success',
          })
          that.callbackStep(STEP.RESULT,true)
        }

        break;
      case CONTROL_OPCODES.SELECT:
        console.log('dataEventListener->SELECT');

        var skipSendingInitPacket = false;
        var resumeSendingInitPacket = false;
        console.log(" offset:" + parsedResponse.data.offset);
        if (parsedResponse.data.offset > 0 && parsedResponse.data.offset <= imageBuf.byteLength) {
          if (parsedResponse.data.offset == imageBuf.byteLength) {
            skipSendingInitPacket = true;
          } else {
            resumeSendingInitPacket = true;
            console.log("已发送crc:" + crc.crc32(imageBuf.slice(0, parsedResponse.data.offset)))
            imageBuf = imageBuf.slice(parsedResponse.data.offset)
            console.log("未发送crc:" + crc.crc32(imageBuf))
          }
        }
        // 说明锁上没镜像数据
        if (parsedResponse.data.offset == 0) {
          // TODO: Size should not be hard-coded.

          that.sendCreatePackage(that.formater4length(0x1000)); //4096为一页
          return;
        }
       //数据没发送完，也可以发这个命令。之后也会返回校验数据

        var buffer = new ArrayBuffer(1)
        var dataView = new DataView(buffer)
        //写入通道指令 
        dataView.setUint8(0, CONTROL_OPCODES.EXECUTE)
        return that.bleWriteTo90001(device, dataView, buffer)
          .then(function(res) {

            return bleUtils.onBLECharacteristicValueChange(function(res) {
              console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
              console.log(" value: " + that.ab2hex(res.value));

              that.dataEventListener(res);

            })
          })
        break;
      default:
        throw new Error(`Unknwon response op-code received: ${controlOpCodeToString(responseOpCode)}.`);
    }
  },
  sendPRN: function() {
    var that = this
    var booleanCallback = true;
    var buffer = new ArrayBuffer(3)
    var dataView = new DataView(buffer)
    //写入通道指令 
    dataView.setUint8(0, CONTROL_OPCODES.SET_PRN)
    dataView.setUint8(1, 0x00)
    dataView.setUint8(2, 0x00)
    var device = that.data.device
    // First, select the Command Object. As a response the maximum command size and information whether there is already
    return that.bleWriteTo90001(device, dataView, buffer)
      .then(function(res) {

        return bleUtils.onBLECharacteristicValueChange(function(res) {
          console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
          console.log("CREATE->  " + that.ab2hex(res.value) + " length:" + that.ab2hex(res.value).length);
          if (that.ab2hex(res.value)) {
            booleanCallback = false;
            that.controlPointNotificationHandler(res);
          }

        }).then(function(res) {
          console.log(" recv:" + JSON.stringify(res));
        })
      })
  },
  //发送执行命令
  sendEXECUTE: function() {
    var that = this
    var buffer = new ArrayBuffer(1)
    var dataView = new DataView(buffer)
    //写入通道指令 
    dataView.setUint8(0, CONTROL_OPCODES.EXECUTE)
    var device = that.data.device

    return that.bleWriteTo90001(device, dataView, buffer)
      .then(function(res) {

        return bleUtils.onBLECharacteristicValueChange(function(res) {
          console.log(" CALCULATE_CHECKSUM:" + JSON.stringify(res));
          console.log("value  " + that.ab2hex(res.value));
          that.controlPointNotificationHandler(res);

        })
      })

  },
  // 创建一个数据对象，size 代表要发送的字节长度。发送的范围看设备返回的限制，这里是 4096
  sendCreatePackage: function(size) {
    var that = this;
    var device = that.data.device;

    let buffer = new ArrayBuffer(6)
    let dataView = new DataView(buffer)
    //写入通道指令 
    dataView.setUint8(0, CONTROL_OPCODES.CREATE)
    dataView.setUint8(1, CONTROL_PARAMETERS.DATA_OBJECT)
    dataView.setUint8(2, size[0])
    dataView.setUint8(3, size[1])
    dataView.setUint8(4, 0x0)
    dataView.setUint8(5, 0x0)

    // First, select the Command Object. As a response the maximum command size and information whether there is already
    return that.bleWriteTo90001(device, dataView, buffer)
      .then(function(res) {

        return bleUtils.onBLECharacteristicValueChange(function(res) {
          console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
          console.log(" value: " + that.ab2hex(res.value));

          that.dataEventListener(res);

        })
      })
  },
  //create an object
  sendCreate: function() {
    var that = this
    var buffer = new ArrayBuffer(6)
    var dataView = new DataView(buffer)
    //写入通道指令 
    dataView.setUint8(0, CONTROL_OPCODES.CREATE)
    dataView.setUint8(1, CONTROL_PARAMETERS.COMMAND_OBJECT)
    dataView.setUint8(2, 0x8d)
    dataView.setUint8(3, 0x0)
    dataView.setUint8(4, 0x0)
    dataView.setUint8(5, 0x0)
    var device = that.data.device
    // First, select the Command Object. As a response the maximum command size and information whether there is already
    return that.bleWriteTo90001(device, dataView, buffer)
      .then(function(res) {

        return bleUtils.onBLECharacteristicValueChange(function(res) {
          console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));

          that.controlPointNotificationHandler(res);

        })
      })
  },
  bufferFromHex: function(hex) {
    var typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function(h) {
      return parseInt(h, 16)
    }))
    return typedArray.buffer
  },
  // sendInit
  writeBleDat: function(device, buffer, offset) {
    wx.showToast({
      title: '即将写入init包',
    })
    let self = this
    let start = offset
    let length = buffer.byteLength
    console.log("writeBleDat:" + self.ab2hex(buffer) + " offset:" + offset + " length:" + length);

    for (; offset < length; offset = offset + 20) {

      let step = offset + 20 > length ? length - offset : 20
      let uint8Array = new Uint8Array(buffer, offset, step)
      let hex = ""
      for (let i in uint8Array) {
        let num = uint8Array[i];
        if (num < 16) {
          hex += '0'
        }
        hex += num.toString(16)
      }
      console.log("writeBleDat:" + hex)
      let targetData = self.bufferFromHex(hex)
      wx.writeBLECharacteristicValue({
        deviceId: device.deviceId,
        serviceId: device.serverFE59["uuid"],
        characteristicId: device.characteristic90002["uuid"],
        value: targetData,
        fail: function(err) {
          offset = offset - 20 //失败了重写一遍
          console.log('write dat fail', err)
        }
      })
      let percentage = (offset + step) / length
      percentage = (percentage * 100).toFixed(1)
      wx.showLoading({
        title: '写入' + percentage + '%',
        mask: true
      })

      if (offset + step == length) {
        wx.showToast({
          title: '写入完成',
        })
        // self.writeConfigInfo(device)
        var buffer = new ArrayBuffer(1)
        var dataView = new DataView(buffer)
        //写入通道指令 
        dataView.setUint8(0, CONTROL_OPCODES.CALCULATE_CHECKSUM)
        var device = self.data.device
        console.log("readFile");
        return self.bleWriteTo90001(device, dataView, buffer)
          .then(function(res) {

            return bleUtils.onBLECharacteristicValueChange(function(res) {
              console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
              console.log(".dat  " + self.ab2hex(res.value));
              self.controlPointNotificationHandler(res);

            })
          })
        break
      }
      var timestamp1 = (new Date()).getTime();
      var timestamp2 = (new Date()).getTime();
      while (timestamp2 - timestamp1 < 40) {
        timestamp2 = (new Date()).getTime();
      }

      if (offset - start == 1000) {
        setTimeout(function(res) {
          self.writeBleDat(device, buffer, offset + 20)
        }, 100)
        return;
      }
    }
  },
  // sendFirmware  
  writeBleBin: function(device, buffer, offset) { // mark: writeBleBin
    wx.hideLoading();
    let self = this
    self.setData({
      loadingHidden: false
    })
    let start = offset
    let length = buffer.byteLength
    console.log("writeBleBin:" + self.ab2hex(buffer) + " offset:" + offset + " length:" + length);

    for (; offset < length; offset = offset + 20) {

      let step = offset + 20 > length ? length - offset : 20
      let uint8Array = new Uint8Array(buffer, offset, step)
      let hex = ""
      for (let i in uint8Array) {
        let num = uint8Array[i];
        if (num < 16) {
          hex += '0'
        }
        hex += num.toString(16)
      }
      console.log("writeBleDat:" + hex)
      let targetData = self.bufferFromHex(hex)

      wx.writeBLECharacteristicValue({
        deviceId: device.deviceId,
        serviceId: device.serverFE59["uuid"],
        characteristicId: device.characteristic90002["uuid"],
        value: targetData,
        fail: function(err) {
          offset = offset - 20 //失败了重写一遍
          console.log('write bin fail', err)
        }
      })
      let percentage = (offset + step) / length
      percentage = (percentage * 100).toFixed(1)
      self.setData({
        total:total,
        count:count,
        percentage:percentage
      })
     

      if (offset + step == length) {
      
        // self.writeConfigInfo(device)
        var buffer = new ArrayBuffer(1)
        var dataView = new DataView(buffer)
        //写入通道指令 
        dataView.setUint8(0, CONTROL_OPCODES.CALCULATE_CHECKSUM)
        var device = self.data.device
        console.log("readFile");
        return self.bleWriteTo90001(device, dataView, buffer)
          .then(function(res) {

            return bleUtils.onBLECharacteristicValueChange(function(res) {
              console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
              console.log(".bin  " + self.ab2hex(res.value));
              self.dataEventListener(res);

            })
          })
        break
      }
      var timestamp1 = (new Date()).getTime();
      var timestamp2 = (new Date()).getTime();
      while (timestamp2 - timestamp1 < 40) {
        timestamp2 = (new Date()).getTime();
      }

      if (offset - start == 1000) {
        setTimeout(function(res) {
          self.writeBleBin(device, buffer, offset + 20)
        }, 200)
        return;
      }
    }
  },
  // 测试一下crc 是否正常
  matchCrc: function() {
    var that = this;
    console.log("crc校验" + imageBuf.byteLength)
    var count = imageBuf.byteLength / 4096;
    console.log(count)
    for (var i = 0; i <= count + 1; i++) {
      console.log("CRC: " + crc.crc32(imageBuf.slice(0, 4096 * (i + 1))) + "  i:" + (i + 1))
      console.log("CRC: " + crc.crc32(imageBuf.slice(0, 4096 * (i + 1))).toString(16) + "  i:" + (i + 1))

      console.log(imageBuf.slice(4096 * (i + 1)).byteLength.toString(16) + "  size:" + (4096).toString(16))

    }

    console.log(imageBuf.slice(94208).byteLength.toString(16))
    console.log(imageBuf.slice(94208).byteLength.toString(16).length)

    var dada = (0x1000).toString(16)
    console.log(that.formater4length(dada)[0])
  },
  formater4length: function(data) {
    data = data.toString(16)
    if (data.length == 3) {
      data = "0" + data
    } else if (data.length == 2) {
      data = "00" + data
    } else if (data.length == 1) {
      data = "000" + data
    }
    var dataArray = new Array();
    dataArray.push("0x" + data.slice(2))
    dataArray.push("0x" + data.slice(0, 2))
    console.log("hexstr:" + dataArray)
    return dataArray;

  },
  //进度条的状态
  setPeocessIcon: function(step) {
    var step = step - 1 //记录状态为1的最后的位置

    var processArr = this.data.processData
    // console.log("progress", this.data.detailData.progress)
    for (var i = 0; i < processArr.length; i++) {
      if(step > i){
        processArr[i].icon = '../../img/process_3.png';
      }
      if(step == i){
        if(i == processArr.length -1){
          processArr[i].icon = '../../img/process_3.png';
        }else{
          processArr[i].icon = '../../img/process_2.png';
        }   
      }
      if(step < i){
        processArr[i].icon = '../../img/process_1.png';
      }
    }

    this.setData({
      processData: processArr
    })
  },
  cmdProduceFunction:function (cmdIndex) { // mark: cmdProduceFunction
   let that = this;
    switch (cmdIndex) {
        case OPCODES.SEND_QUERY_DEV_INFO:
            that.sendDeviceInfoCmd();
            break;
        case OPCODES.SEND_UPDATE_START:
          that.sendOTARequestCmd();
            break;
        case OPCODES.SEND_BLOCK_DATA:
          // setTimeout(() => {
            that.sendOTABlockData2(selectBin);
          // }, 100);
          // that.sendDeviceInfoCmd();
          
            break;
        case OPCODES.SEND_TRANS_END:
          that.sendOTADoneResult();
            break;
        case OPCODES.SEND_REBOOT:
          that.sendRebootCmd();
            break;
        default:
            console.log("recevice wrong cmdIndex");
            break;
    }
},
sendData: function(device, dataView, buffer) { // mark: sendData
  this.printSendData(dataView);
  return bleUtils.writeBLECharacteristicValue({
    deviceId: device.deviceId,
    serviceId: UUID_OTA_SERVICE,
    characteristicId: UUID_TX,
    value: buffer
  })
},
sendCommonCmd:function(code){
  var that = this
    var booleanCallback = true;
    var buffer = new ArrayBuffer(4)
    var dataView = new DataView(buffer)
    //写入通道指令 
    dataView.setUint8(0, code)
    dataView.setUint8(1, frameSeq)
    dataView.setUint8(2, 0x00)
    dataView.setUint8(3, 0x00)
    var device = that.data.device
    // First, select the Command Object. As a response the maximum command size and information whether there is already
    return that.sendData(device, dataView, buffer);
      // .then(function(res) {
      //   return bleUtils.onBLECharacteristicValueChange(function(res) {
      //     console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
      //     console.log("CREATE->  " + that.ab2hex(res.value) + " length:" + that.ab2hex(res.value).length);
      //     if (that.ab2hex(res.value)) {
      //       booleanCallback = false;
      //       that.notifyHandle(res);
      //     }
      //   }).then(function(res) {

      //   })
      // },function(error){
      //   console.log("error="+error)
      // }
      // )
},
sendOTARequestCmd:function(){
  var that = this; // mark: sendOTARequestCmd
   // 传输init packet
   let binData = that.data.bin_data;
   var device = that.data.device;

   let buffer = new ArrayBuffer(22);
   let dataView = new DataView(buffer);
   // 写入通道指令
   frameSeq++; 
   dataView.setUint8(0, 0x03) //这里也能写十进制数
   dataView.setUint8(1, frameSeq) //...
   dataView.setUint8(2, 0x20)
   dataView.setUint8(3, 0x00)
  //  dataView.setUint8(21, 0x00)
   let body = new Uint8Array(binData,0,18);
   for (let i = 0; i < body.byteLength; i++) {
    dataView.setUint8(i+4,body[i]);
  }
    // First, select the Command Object. As a response the maximum command size and information whether there is already
    return that.sendData(device, dataView, buffer)
      // .then(function(res) {
      //   return bleUtils.onBLECharacteristicValueChange(function(res) {
      //     console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
      //     console.log("CREATE->  " + that.ab2hex(res.value) + " length:" + that.ab2hex(res.value).length);
      //     if (that.ab2hex(res.value)) {
      //       booleanCallback = false;
      //       that.notifyHandle(res);
      //     }
      //   }).then(function(res) {

      //   })
      // })
},
sendOTABlockData:function(){ // mark: sendOTABlockData
  wx.hideLoading();
  let self = this
  self.setData({
    loadingHidden: false
  })
  // let offset = 0;
  // let bin_data = self.data.bin_data;
  let binData = self.data.bin_data
  let start = offset
  let length = binData.byteLength
  let data = new ArrayBuffer(FRAME_SIZE);
  let dataView = new DataView(data);

  dataView.setUint8(0, 0x05) //这里也能写十进制数
  dataView.setUint8(2, DATA_SIZE)
  dataView.setUint8(3, 0x00)

  // console.log("writeBleBin:" + self.ab2hex(buffer) + " offset:" + offset + " length:" + length);
  frameSeq++;
  for (; offset < length; offset = offset + BLOCK_SZIE) {
    
    let step = offset + BLOCK_SZIE > length ? length - offset : BLOCK_SZIE;
    let body = new Uint8Array(binData, offset, step)
    for (let i = 0; i < body.byteLength; i++) {
      dataView.setUint8(i+8,body[i]);
    }
    dataView.setUint8(1, frameSeq) //...
    dataView.setUint8(4,(DATA_ADDR & 0xFF));
    dataView.setUint8(5,((DATA_ADDR & 0xFF00)>>8));
    dataView.setUint8(6,((DATA_ADDR & 0xFF0000)>>16));
    dataView.setUint8(7,(DATA_ADDR >> 24));
    self.printSendData(dataView);
    // let hex = ""
    // for (let i in uint8Array) {
    //   let num = uint8Array[i];
    //   if (num < 16) {
    //     hex += '0'
    //   }
    //   hex += num.toString(16)
    // }
    // console.log("writeBleDat:" + hex)
    // let targetData = self.bufferFromHex(hex)

    wx.writeBLECharacteristicValue({
      deviceId: self.data.device.deviceId,
      serviceId: UUID_OTA_SERVICE,
      characteristicId: UUID_TX,
      value: data,
      success: function (res) {
        console.log('写入成功', res.errMsg)
        frameSeq++;
        DATA_ADDR += BLOCK_SZIE;
      },
      fail: function(err) {
        offset = offset - BLOCK_SZIE //失败了重写一遍
        console.log('write bin fail', err)
      },
      complete:function(res){
        console.log('complete', res)
      }
    })
    
    let percentage = (offset + step) / length
    percentage = (percentage * 100).toFixed(1)
    console.log("percentage="+percentage);
    self.setData({
      // total:total,
      // count:count,
      percentage:percentage
    })
   

    // if (offset + step == length) {
    
    //   // self.writeConfigInfo(device)
    //   var buffer = new ArrayBuffer(1)
    //   var dataView2 = new DataView(buffer)
    //   //写入通道指令 
    //   dataView2.setUint8(0, CONTROL_OPCODES.CALCULATE_CHECKSUM)
    //   var device = self.data.device
    //   console.log("readFile");
    //   return self.bleWriteTo90001(device, dataView2, buffer)
    //     .then(function(res) {

    //       return bleUtils.onBLECharacteristicValueChange(function(res) {
    //         console.log(" BLECharacteristicValueChange:" + JSON.stringify(res));
    //         console.log(".bin  " + self.ab2hex(res.value));
    //         self.dataEventListener(res);

    //       })
    //     })
    //   break
    // }
    var timestamp1 = (new Date()).getTime();
    var timestamp2 = (new Date()).getTime();
    while (timestamp2 - timestamp1 < 40) {
      timestamp2 = (new Date()).getTime();
    }
    // console.log("offset="+offset+",start="+start);
    // if (offset - start >= 100) {
    //   start = offset;
    //   console.log("###### sleep 100 ms");
    //   setTimeout(function(res) {
    //     // self.writeBleBin(device, buffer, offset + 20)
    //     console.log("###### sleep 200 ms");
    //   }, 0)
    //   // return;
    // }
  }
},

sendOTABlockData2:function(type){ // mark: sendOTABlockData2
  wx.hideLoading();
  let self = this
  self.setData({
    loadingHidden: false
  })
  // let offset = 0;
  // let bin_data = self.data.bin_data;
  let binData = self.data.bin_data
  let length = 0;

  if(type == 0){
     offset = bin1Offset;
     length = binData.byteLength;
  }else if(type == 1){
    offset = bin1Offset;
    length = bin1Length;
  }else if(type == 2){
    offset = bin2Offset;
    length = bin2Length;
  }

  console.log("offset="+offset+",length="+length);
  // return;
  let start = offset
  let data = new ArrayBuffer(FRAME_SIZE);
  let dataView = new DataView(data);

  dataView.setUint8(0, 0x05) //这里也能写十进制数
  dataView.setUint8(2, DATA_SIZE)
  dataView.setUint8(3, 0x00)

  // console.log("writeBleBin:" + self.ab2hex(buffer) + " offset:" + offset + " length:" + length);
  frameSeq++;


  var inter = setInterval(function(){
    
    let step = offset + BLOCK_SZIE > length ? length - offset : BLOCK_SZIE;
    let body = new Uint8Array(binData, offset, step)
    for (let i = 0; i < body.byteLength; i++) {
      dataView.setUint8(i+8,body[i]);
    }
    dataView.setUint8(1, frameSeq) //...
    dataView.setUint8(4,(DATA_ADDR & 0xFF));
    dataView.setUint8(5,((DATA_ADDR & 0xFF00)>>8));
    dataView.setUint8(6,((DATA_ADDR & 0xFF0000)>>16));
    dataView.setUint8(7,(DATA_ADDR >> 24));
    self.printSendData(dataView);

    wx.writeBLECharacteristicValue({
      deviceId: self.data.device.deviceId,
      serviceId: UUID_OTA_SERVICE,
      characteristicId: UUID_TX,
      value: data,
      success: function (res) {
        // console.log('写入成功', res.errMsg)
        frameSeq++;
        DATA_ADDR += BLOCK_SZIE;
      },
      fail: function(err) {
        offset = offset - BLOCK_SZIE //失败了重写一遍
        console.log('write bin fail', err)
      },
      // complete:function(res){
      //   console.log('complete', res)
      // }
    })
    
    let percentage = (offset + step) / length
    percentage = (percentage * 100).toFixed(1)
    console.log("percentage="+percentage);
    self.setData({
      percentage:percentage
    })
    offset = offset + BLOCK_SZIE;
    if(offset >= length){
      console.log('升级结束')
        wx.hideLoading()
        clearInterval(inter)
    }
    
    // var timestamp1 = (new Date()).getTime();
    // var timestamp2 = (new Date()).getTime();
    // while (timestamp2 - timestamp1 < 40) {
    //   timestamp2 = (new Date()).getTime();
    // }
  },DATA_DELAY_TIME)
},

sendDeviceInfoCmd:function(){
  return this.sendCommonCmd(OPCODES.SEND_QUERY_DEV_INFO);
},
sendOTADoneResult:function(){
  return this.sendCommonCmd(OPCODES.SEND_TRANS_END);
},
sendRebootCmd:function(){
  return this.sendCommonCmd(OPCODES.SEND_REBOOT);
},
u8ToHexStr:function(col,name){
  let hex = '';
  for (let i = 0; i < col.byteLength; i++) {
      let num = col[i];
      // console.log(num);
      if (num < 16) {
        hex += '0'
      }
      hex += num.toString(16) + ","
    }
    console.log(name + ":" + hex);
},
dataView2Str:function(col,name){
  let hex = '';
  for (let i = 0; i < col.byteLength; i++) {
      let num = col[i];
      // console.log(num);
      if (num < 16) {
        hex += '0'
      }
      hex += col.getUint8(i).toString(16) + ","
    }
    console.log(name + ":" + hex);
},
getHeaderData:function(bin_data){ // mark: getHeaderData
  // | len1 | len2 | crc1 | crc2 | vid | pid | ver | reserved |
  //  | 4   |  4   |  2   |  2   |   2 |  2  |   2 |   14     |
  let that = this;
  //header 32 bytes
  let header = new Uint8Array(bin_data, 0,32)
  let len1 = new Uint8Array(bin_data, 0,4);
  let len2 = new Uint8Array(bin_data,4,4);
  let crc1 = new Uint8Array(bin_data,8,2);
  let crc2 = new Uint8Array(bin_data,10,2);
  let vid = new Uint8Array(bin_data,12,2);
  let pid = new Uint8Array(bin_data,14,2);
  let ver = new Uint8Array(bin_data,16,2);
  let resverd = new Uint8Array(bin_data,18,14)

  that.u8ToHexStr(len1,"len1");
  that.u8ToHexStr(len2,"len2");
  that.u8ToHexStr(crc1,"crc1");
  that.u8ToHexStr(crc2,"crc2");
  that.u8ToHexStr(vid,"vid");
  that.u8ToHexStr(pid,"pid");
  that.u8ToHexStr(ver,"ver");
  that.u8ToHexStr(resverd,"resverd");

  
  bin1Length =  littleEndianUtils.littleEndianUint8Array(len1); 
  bin2Length =  littleEndianUtils.littleEndianUint8Array(len2);
  bin1Offset = 0x20;
  bin2Offset = bin1Length + bin1Offset;

  console.log("bin1lenth="+bin1Length+",bin2length="+bin2Length+",binoffset="+bin1Offset+",bin2offset="+bin2Offset);

  // that.sendOTARequestCmd();
},
printSendData:function(dataView){ // mark: end
  console.log("发送的数据：")
  let hex = '';
  for (let i = 0; i < dataView.byteLength; i++) {
    let num = dataView[i];
      if (num < 16) {
        hex += '0'
      }
    hex += dataView.getUint8(i).toString(16) + ","
  }
  console.log(hex);
},
})