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

const OPCODES = {
  SEND_QUERY_DEV_INFO: 0x01,
  RES_QUERY_DEV_INFO: 0x02,
  SEND_UPDATE_START: 0x03,
  RES_UPDATE_START: 0x04,
  SEND_BLOCK_DATA: 0x05,
  RECV_RETRANSFER_REQ: 0x06,
  SEND_TRANS_END: 0x07,
  RES_TRANS_END: 0x08,
  SEND_REBOOT: 0x0B,
};

const reverseLookup = obj => val => {
  for (const k of Object.keys(obj)) {
    if (obj[k] === val) {
      return k;
    }
  }
  return 'UNKNOWN';
};

// const controlOpCodeToString = reverseLookup(CONTROL_OPCODES);
// const resultCodeToString = reverseLookup(RESULT_CODES);
// console.log(controlOpCodeToString);


let expectedCRC;
const binFilename = "JD-V10_BETA_OTA_0308.bin";
const UUID_OTA_SERVICE = 'F000FFC0-0451-4000-B000-000000000000';
const UUID_TX = 'F000FFC1-0451-4000-B000-000000000000';
const UUID_RX = 'F000FFC2-0451-4000-B000-000000000000';
let frameSeq = 0x00;
const FRAME_SIZE = 20;
// const BLOCK_SZIE = FRAME_SIZE - 8;
const BLOCK_SZIE = 160;
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
// let selectBin = 0;
let FILE_HEADER_SIZE = 32;
let passSendData = false;
let successCount=0,failCount=0,resendCount=0;
let binLength = 0;
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
    loadingHidden: true,
    bin_data: '',
    device: '',
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
        // that.sendOTABlockData3(1);
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
      }
    })
    bleUtils.onBLECharacteristicValueChange(function(res) {
       that.notifyHandle(res);
    } )
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
    }).then(function(res) {

      console.log(JSON.stringify(res));
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
      //   let resver = data.getUint8(10);
      //   if(resver == 1) 
      //     selectBin = 2;
      //   else if(resver == 2) 
      //     selectBin =1;
      //  else
      //    console.log("Reserved值不合法????")
      //   console.log("selectBin="+selectBin);
        that.cmdProduceFunction(OPCODES.SEND_UPDATE_START);
        break;
     case OPCODES.RES_UPDATE_START:
      console.log("result="+data.getUint8(4).toString(16));
      console.log("addr="+data.getUint8(5).toString(16)+" "+data.getUint8(6).toString(16)+" "+data.getUint8(7).toString(16)+" "+data.getUint8(8).toString(16));
      console.log("length="+data.getUint8(9).toString(16)+" "+data.getUint8(10).toString(16)+" "+data.getUint8(11).toString(16)+" "+data.getUint8(12).toString(16));
      console.log("size="+data.getUint8(13).toString(16)+" "+data.getUint8(14).toString(16));
      let addr = littleEndianUtils.littleEndianUInt32(data.getUint32(5));
      let length = littleEndianUtils.littleEndianUInt32(data.getUint32(9));
      console.log("addr="+addr+",length="+length);
      // DATA_ADDR = addr;
      // offset = addr - FILE_HEADER_SIZE;
      offset = addr;
      bin1Length = length;
      that.cmdProduceFunction(OPCODES.SEND_BLOCK_DATA);
        break;
        case OPCODES.RECV_RETRANSFER_REQ:
          resendCount++;
          console.log("recv resend request")
          console.log("framreq="+data.getUint8(1).toString(16));
          console.log("addr="+data.getUint8(4).toString(16)+" "+data.getUint8(5).toString(16)+" "+data.getUint8(6).toString(16)+" "+data.getUint8(7).toString(16));
          let resendAddr = littleEndianUtils.littleEndianUInt32(data.getUint32(4));
          let seq = data.getUint8(1);
          if(seq != frameLastFreq && resendAddr != lastAddr){
            frameSeq = seq + 1;
            if(frameSeq >= 0xff){
              frameSeq =0;
            }
            // DATA_ADDR = resendAddr;
            // offset = resendAddr-FILE_HEADER_SIZE;
            offset = resendAddr;
            frameLastFreq = frameSeq;
            lastAddr = offset;
            passSendData = false;
          }else{
              passSendData = true; 
          }
          
          break;
        case OPCODES.RES_TRANS_END:
          console.log("result="+data.getUint8(4).toString(16));
          let result = data.getUint8(4);
          if(result == 0x00){
            console.log("升级成功")
          }else{
            console.log("升级失败")
          }
          that.cmdProduceFunction(OPCODES.SEND_REBOOT);
            break;
      default:
        throw new Error(`Unknwon response op-code received: ${controlOpCodeToString(responseOpCode)}.`);
    }
  },

  bufferFromHex: function(hex) {
    var typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function(h) {
      return parseInt(h, 16)
    }))
    return typedArray.buffer
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
            that.sendOTABlockData2();
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
  let length = bin1Length;
  let requestLength = offset + length;
  let curLength = 0;

  // if(type == 0){
  //    offset = 0;
  //    length = bin1Length + bin2Length;
  //    requestLength = length;
  // }else if(type == 1){
  //   offset = 0;
  //   length = bin1Length;
  //   requestLength = length;
  // }else if(type == 2){
  //   offset = bin1Length;
  //   length = bin2Length;
  //   requestLength = bin1Length + bin2Length;
  // }
  let total = Math.round(length / BLOCK_SZIE) ;
  // let count = 0;

  console.log("offset="+offset+",length="+length+",requestLength="+requestLength);
  // return;
  // let start = offset
  // console.log("writeBleBin:" + self.ab2hex(buffer) + " offset:" + offset + " length:" + length);
  frameSeq++;

  
  var inter = setInterval(function(){

    if(offset >= requestLength){
      console.log('升级结束')
      console.log("successCount="+successCount+",failCount="+failCount+",resendCount="+resendCount);
        // wx.hideLoading()
        self.setData({
          loadingHidden: true
        })
        clearInterval(inter)
        self.cmdProduceFunction(OPCODES.SEND_TRANS_END)
        return;
    }
    
    let step = offset + BLOCK_SZIE > requestLength ? requestLength - offset : BLOCK_SZIE;
    let body = new Uint8Array(binData, offset, step)
    let data = new ArrayBuffer(step+8);
    let dataView = new DataView(data);

    for (let i = 0; i < body.byteLength; i++) {
      dataView.setUint8(i+8,body[i]);
    }
    dataView.setUint8(0, 0x05) //这里也能写十进制数
    dataView.setUint8(1, frameSeq) //...
    dataView.setUint8(2, step+4)
    dataView.setUint8(3, 0x00)
    dataView.setUint8(4,(offset & 0xFF));
    dataView.setUint8(5,((offset & 0xFF00)>>8));
    dataView.setUint8(6,((offset & 0xFF0000)>>16));
    dataView.setUint8(7,(offset >> 24));
    self.printSendData(dataView);
    console.log("frameseq="+frameSeq+",offset="+offset+",step="+step);
    // if(DATA_ADDR - offset != 32){
    //   console.log('发送数据错误')
    //   console.log("successCount="+successCount+",failCount="+failCount+",resendCount="+resendCount);
    //     // wx.hideLoading()
    //     self.setData({
    //       loadingHidden: true
    //     })
    //     clearInterval(inter)
    //     // self.cmdProduceFunction(OPCODES.SEND_TRANS_END)
    //     return;
    // }
    if(passSendData) {
      console.log('跳过重复的数据')
      // frameSeq++;
      // DATA_ADDR += step;
      // offset += step;
      // curLength += step;
      passSendData = false;
    }else{
      wx.writeBLECharacteristicValue({
        deviceId: self.data.device.deviceId,
        serviceId: UUID_OTA_SERVICE,
        characteristicId: UUID_TX,
        value: data,
        success: function (res) {
          console.log('写入成功', res.errMsg)
          frameSeq++;
          // DATA_ADDR += step;
          offset += step;
          curLength += step;
          successCount++;
        },
        fail: function(err) {
          // offset = offset - BLOCK_SZIE //失败了重写一遍
          console.log('写入失败', res.errMsg)
          failCount++;
        },
        // complete:function(res){
        //   console.log('complete', res)
        // }
      })
    }
    
    // let curLen = (offset >= length) ? offset - length : offset;
    let percentage = curLength / length
    percentage = (percentage * 100).toFixed(1)
    console.log("percentage="+percentage);
    self.setData({
      percentage:percentage,total:total,count:successCount
    })
    // offset = offset + BLOCK_SZIE;

    if(offset >= requestLength){
      console.log('升级结束')
      console.log("successCount="+successCount+",failCount="+failCount+",resendCount="+resendCount);
        // wx.hideLoading()
        self.setData({
          loadingHidden: true
        })
        clearInterval(inter)
        self.cmdProduceFunction(OPCODES.SEND_TRANS_END)
        return;
    }
    
    // var timestamp1 = (new Date()).getTime();
    // var timestamp2 = (new Date()).getTime();
    // while (timestamp2 - timestamp1 < 40) {
    //   timestamp2 = (new Date()).getTime();
    // }
  },DATA_DELAY_TIME)
},

sendOTABlockData3:function(type){ // mark: sendOTABlockData3
  wx.hideLoading();
  let self = this
  self.setData({
    loadingHidden: false
  })
  // let offset = 0;
  // let bin_data = self.data.bin_data;
  let binData = self.data.bin_data
  let length = 0;
  let total = length;

  if(type == 0){
     offset = 0;
     length = bin1Length + bin2Length;
     total = length;
  }else if(type == 1){
    offset = 0;
    length = bin1Length;
    total = length;
  }else if(type == 2){
    offset = bin1Length;
    length = bin2Length;
    total = bin1Length + bin2Length;
  }

  console.log("offset="+offset+",length="+length+",total="+total);
  // return

  // console.log("writeBleBin:" + self.ab2hex(buffer) + " offset:" + offset + " length:" + length);
  frameSeq++;


  var inter = setInterval(function(){
    
    let step = offset + BLOCK_SZIE > length ? length - offset : BLOCK_SZIE;
    console.log("frameseq="+frameSeq+",data_addr="+DATA_ADDR+",offset="+offset+",step="+step);
        frameSeq = (frameSeq == 0xFF ) ? 0 : frameSeq++;
        DATA_ADDR += step;
        offset += step;
   
    // if((offset+BLOCK_SZIE) >= total){
      // if(offset + step  == total){
      if(offset >= total) {
      console.log('升级结束')
        wx.hideLoading()
        clearInterval(inter)
    }
  },0)
},

sendDeviceInfoCmd:function(){
  return this.sendCommonCmd(OPCODES.SEND_QUERY_DEV_INFO);
},
sendOTADoneResult:function(){
  return this.sendCommonCmd(OPCODES.SEND_TRANS_END);
},
sendRebootCmd:function(){ // mark: sendRebootCmd
  frameSeq++;
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