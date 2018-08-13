var inherits = require('util').inherits;
var moment   = require('moment');

var Polling = require('../helper/polling.js');
var eventPolling = require('../helper/simple-event-polling.js');
var reset = require('../helper/value-resetter.js');

var Characteristic, Service, FakeGatoHistoryService, Accessory, FakeGatoHistorySetting;

module.exports = function(characteristic, service, fakegatohistoryservice, accessory, fakegatohistorysetting) {
    Characteristic = characteristic;
    Service = service;
    FakeGatoHistoryService = fakegatohistoryservice;
    Accessory = accessory;
    FakeGatoHistorySetting = fakegatohistorysetting;

    return PowerMeter;
};

// PowerMeter
//
function PowerMeter(log, config) {
    this.log = log;

    this.displayName      = config.displayName; // for fakegato
    this.name             = config.displayName; // for homebridge
    this.uniqueId         = config.uniqueId;
    this.pollingInterval  = config.pollingInterval;
    this.historyInterval  = config.historyInterval;
    this.wattGetter       = config.wattGetter;

    this.additionalServices = config.additionalServices;
    
    inherits(PowerMeter, Accessory);
}


PowerMeter.prototype = {

    getServices: function() {
        var services = [];
        var info = new Service.AccessoryInformation();
        info.setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Tesla')
            .setCharacteristic(Characteristic.Model, 'Power Meter')
            .setCharacteristic(Characteristic.FirmwareRevision, '-')
            .setCharacteristic(Characteristic.SerialNumber, this.uniqueId);
        services.push(info);

        if (this.additionalServices.homekitVisual) {
            this.wattVisualizer = new Service.Fan(this.name + ' ' + 'Flow');
            this.wattVisualizer
                .getCharacteristic(Characteristic.On)
                .on('get', this.getOnWattVisualizer.bind(this))
                .on('set', this.setOnWattVisualizer.bind(this));
            eventPolling(this.wattVisualizer, Characteristic.On);
            this.wattVisualizer
                .getCharacteristic(Characteristic.RotationSpeed)
                .setProps({maxValue: 100, minValue: -100, minStep: 1})
                .on('get', this.getRotSpWattVisualizer.bind(this))
                .on('set', this.setRotSpWattVisualizer.bind(this));
            eventPolling(this.wattVisualizer, Characteristic.RotationSpeed);
            services.push(this.wattVisualizer);
        }

        // Eve Powermeter
        
        if (this.additionalServices.evePowerMeter) {
            this.powerConsumption = new Service.PowerMeterService(
                this.name + ' ' + 
                'Power Meter');
            this.powerConsumption
                .getCharacteristic(Characteristic.CurrentPowerConsumption)
                .on('get', this.getWatt.bind(this));
            eventPolling(this.powerConsumption, Characteristic.CurrentPowerConsumption);
            services.push(this.powerConsumption);
        }

        // History
        if (this.additionalServices.evePowerMeter &&
            this.additionalServices.eveHistory) {
            this.powerMeterHistory = 
                new FakeGatoHistoryService('energy', this, FakeGatoHistorySetting);
            services.push(this.powerMeterHistory);

            var wattHistory = new Polling(this.wattGetter, this.historyInterval);
            wattHistory.pollValue(function(error, value) {
                // set negative values to 0
                if (value < 0) {
                    value = 0;
                }
                this.log.debug('Watt History value: ' + value);
                this.powerMeterHistory.addEntry(
                    {time: moment().unix(), power: value});
            }.bind(this));
        }

        return services;
    },

    getWatt: function(callback) {
        this.wattGetter.requestValue(function(error, value) {
            callback(error, value);
        });
    },

    getOnWattVisualizer: function(callback) {
        this.wattGetter.requestValue(function(error, value) {
            callback(error, Math.round(value/100) !== 0);
        });
    },

    setOnWattVisualizer: function(state, callback) {
        callback();
        reset(
            this.wattVisualizer, 
            Characteristic.On, 
            this.getOnWattVisualizer.bind(this));
    },

    getRotSpWattVisualizer: function(callback) {
        this.wattGetter.requestValue(function(error, value) {
            callback(error, value / 100); // 100 % = 10_000W
        });
    },

    setRotSpWattVisualizer: function(state, callback) {
        callback();
        reset(
            this.wattVisualizer, 
            Characteristic.RotationSpeed, 
            this.getRotSpWattVisualizer.bind(this));
    },
};


