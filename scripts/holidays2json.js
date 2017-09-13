#!/usr/bin/env node

'use strict'

var fs = require('fs')
var resolve = require('path').resolve
var jsyaml = require('js-yaml')
var PrePin = require('prepin')
var _ = require('lodash')

var REGEX = /^([A-Z]+)\.yaml$/

var config = {
  dirname: resolve(__dirname, '..', 'data'),
  countries: resolve(__dirname, '..', 'data', 'countries'),
  factories: [
    resolve(__dirname, '..', 'src', 'CalEventFactory.js'),
    resolve(__dirname, '..', 'lib', 'CalEventFactory.js')
  ]
}

function Holidays2json (opts) {
  this.opts = opts || {}
  this.list = this.opts.list || []
}
Holidays2json.prototype = {
  /**
   * get list of supported countries from directory
   */
  getList: function () {
    var list = fs.readdirSync(config.countries)
    list = list
      .map(function (file) {
        if (REGEX.test(file)) {
          return file.replace(REGEX, '$1')
        }
      })
      .filter(function (file) {
        return file
      })
      .sort()
    this.list = list
    return this
  },
  /**
   * load a single yaml file
   */
  load: function (cc, filename) {
    filename = filename || resolve(config.countries, cc + '.yaml')
    var data = fs.readFileSync(filename, 'utf8')
    var obj = jsyaml.safeLoad(data)
    return obj
  },
  /**
   * build `holidays.json file`
   */
  build: function () {
    var obj = this.load('0')
    obj.holidays = {}
    this.list.forEach(function (cc) {
      Object.assign(obj.holidays, this.load(cc).holidays)
    }.bind(this))
    Object.assign(obj, this.load(null, resolve(config.dirname, 'names.yaml')))

    if (this.opts.pick) {
      obj.holidays = _.pick(obj.holidays, this.opts.pick)
    } else if (this.opts.omit) {
      obj.holidays = _.omit(obj.holidays, this.opts.omit)
    }

    obj.version = new Date().toISOString().replace(/^(.*)T.*$/, '$1')
    this.holidays = obj
    // this.prepin()

    return this
  },
  /**
   * save holidays
   */
  save: function () {
    var json = JSON.stringify(this.holidays, null, 2) + '\n'
    fs.writeFileSync(resolve(config.dirname, 'holidays.json'), json, 'utf8')
  },
  prepin: function () {
    // reduce final build size
    var macros = dive(this.holidays)
    config.factories.forEach(function (fa) {
      new PrePin({macros: macros, input: fa, output: fa}).proc().catch(function (e) {
        console.error(e)
      })
    })
  }
}
module.exports = Holidays2json

if (module === require.main) {
  var args = process.argv.splice(2)

  var getOption = function (option) {
    var i = args.indexOf(option)
    if (i !== -1) {
      var list = args[i + 1].toUpperCase().split(',').sort()
      if (list && list.length) return list
    }
  }

  if (args.indexOf('-h') !== -1 || args.indexOf('--help') !== -1) {
    console.log([
      '',
      'holidays2json [options]',
      '',
      'translate holidays.yaml data to json',
      '',
      '-p|--pick   comma separated list of countries to pick',
      '            from holidays.json file',
      '-o|--omit   comma separated list of countries to omit',
      '            from holidays.json file',
      '',
      'NOTE: There are some countries which depend on data of others which',
      '      might render the file useless. e.g. "GU" requires "US", so try',
      '      to pick or omit both.',
      '',
      'Use in your build process in package.json "scripts" section.',
      '      "build" : "holidays2json -p US,CA,GU"',
      '      and run then with `npm run build`',
      ''
    ].join('\n    '))
    process.exit(0)
  }

  var opts = {
    pick: getOption('--pick') || getOption('-p'),
    omit: getOption('--omit') || getOption('-o')
  }

  new Holidays2json(opts).getList().build().save()
}

/**
* searches for `days` to obtain macros for prepin
*/
function dive (data, macros) {
  macros = macros || {
    nojulian: true,
    nohebrew: true,
    noislamic: true,
    nochinese: true,
    noequinox: true
  }
  switch (toString.call(data)) {
    case '[object Object]':
      Object.keys(data).forEach(function (key) {
        if (key === 'days') {
          Object.keys(data[key]).forEach(function (key) {
            if (/\b(Muharram|Safar|Rabi al-awwal|Rabi al-thani|Jumada al-awwal|Jumada al-thani|Rajab|Shaban|Ramadan|Shawwal|Dhu al-Qidah|Dhu al-Hijjah)\b/.test(key)) {
              delete macros.noislamic
            } else if (/\b(julian)\b/.test(key)) {
              delete macros.nojulian
            } else if (/\b(chinese|vietnamese|korean)\b/.test(key)) {
              delete macros.nochinese
            } else if (/\b(equinox|solstice)\b/.test(key)) {
              delete macros.noequinox
            } else if (/\b(Nisan|Iyyar|Sivan|Tamuz|Av|Elul|Tishrei|Cheshvan|Kislev|Tevet|Shvat|Adar)\b/.test(key)) {
              delete macros.nohebrew
            }
          })
        } else {
          dive(data[key], macros)
        }
      })
      break
  }
  return macros
}