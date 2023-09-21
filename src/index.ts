/*
 * Copyright 2021 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let props: any
  let onStop:any = []
  
  const plugin: Plugin = {
    start: function (properties: any) {
      props = properties
      setupRaymarineBrightness()
      setupRaymarineColor()
      setupRaymarineNightMode()

      setupSimradBrightness()
      setupSimradNightColor()
      setupSimradNightMode()

      if ( properties.groupMappings && properties.groupMappings.length > 0 ) {
        subscribeToSimnet(properties)
        subscribeToRaymarine(properties)
      }
    },

    stop: function () {
      onStop.forEach((f:any) => f())
      onStop = []
    },

    id: 'signalk-n2k-displays',
    name: 'NMEA 2000 Display Control',
    description: 'Signal K Plugin that controls and syncs display devices from Raymarine and Navico devices',

    schema: () => {
      const schema: any = {
        type: 'object',
        required: ['raymarineDayColor', 'raymarineNightColor' ],
        properties: {
          raymarineNightColor: {
            type: 'string',
            title: 'Raymarine Night Color',
            enum: Object.keys(raymarineColorMap),
            enumNames: Object.values(raymarineColorMap),
            default: 'red/black'
          },
          raymarineDayColor: {
            type: 'string',
            title: 'Raymarine Day Color',
            enum: Object.keys(raymarineColorMap),
            enumNames: Object.values(raymarineColorMap),
            default: 'day1'
          },
          groupMappings: {
            title: 'Display Group Mappings',
            description: 'If you setup a mapping, the display settings will be kept in sync between your Raymarine and Navico devices in those groups',
            type: 'array',
            items: {
              type: 'object',
              required: ['raymarineGroup', 'simradGroup' ],
              properties: {
                raymarineGroup: {
                  type: 'string',
                  title: 'Raymarine Group',
                  enum: Object.keys(raymarineDisplayGroups),
                  enumNames: Object.values(raymarineDisplayGroups)
                },
                simradGroup: {
                  type: 'string',
                  title: 'Navico Group',
                  enum: Object.keys(simradDisplayGroups),
                  enumNames: Object.values(simradDisplayGroups)
                },
              }
            }
          }
        }
      }
      return schema
    }
  }

  function getDisplayGroupName(path: string) {
    //electrical.displays.simrad.default.brightness
    let parts = path.split('.')
    return parts[3]
  }

  function getKeyName(path:string) {
    let parts = path.split('.')
    if ( parts[parts.length-1] === 'state' ) {
      return parts[parts.length-2] + '.' + parts[parts.length-1]
    } else {
      return parts[parts.length-1]
    }
  }

  function setupRaymarineColor() {
    Object.keys(raymarineDisplayGroups).forEach(group => {
      let path = `electrical.displays.raymarine.${group}.color`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayColor(group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 'day1'
              },
            ],
            meta: [
              {
                path,
                value: {
                  path,
                  value: {
                    displayName: `${raymarineDisplayGroups[group]} Color`,
                    possibleValues: [
                      ...Object.keys(raymarineColorMap).map((color: any) => {
                        return {
                          title: raymarineColorMap[color],
                          value: color
                        }
                      })
                    ],
                    enum: [...Object.keys(raymarineColorMap)]
                  }
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupRaymarineBrightness() {
    Object.keys(raymarineDisplayGroups).forEach(group => {
      let path = `electrical.displays.raymarine.${group}.brightness`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayBrightness(group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          
          const mapping = props.groupMappings.find((mapping:any) => {
            return mapping.raymarineGroup === group
          })
          if ( mapping ) {
            setSimradDisplayBrightness(mapping.simradGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              },
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${raymarineDisplayGroups[group]} Brightness`,
                  units: 'ratio',
                  range: [ 0, 1 ]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupRaymarineNightMode() {
    Object.keys(raymarineDisplayGroups).forEach(group => {
      let path = `electrical.displays.raymarine.${group}.nightMode.state`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayColor(group, value === 1 ? 'red/black' : 'day1')
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          const mapping = props.groupMappings.find((mapping:any) => {
            return mapping.raymarineGroup === group
          })
          if ( mapping ) {
            setSimradDisplayNightMode(mapping.simradGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              },
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${raymarineDisplayGroups[group]} Night Mode`,
                  units: 'bool'
                }
              },
              {
                path: `electrical.displays.raymarine.${group}.nightMode`,
                value: {
                  displayName: `${raymarineDisplayGroups[group]} Night Mode`
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupSimradNightColor() {
    Object.keys(simradDisplayGroups).forEach(group => {
      let path = `electrical.displays.navico.${group}.nightModeColor`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayNightColor(group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 'red'
              },
            ],
            meta: [
              {
                path,
                value: {
                  path,
                  value: {
                    displayName: `${simradDisplayGroups[group]} Night Color`,
                    possibleValues: [
                      ...Object.keys(simradDisplayNightColors).map((color: any) => {
                        return {
                          title: color.charAt(0).toUpperCase() + color.slice(1),
                          value: color
                        }
                      })
                    ],
                    enum: [...Object.keys(simradDisplayNightColors)]
                  }
                }
              }
            ]
          }
        ]
      })
    })
  }

  
  function setupSimradBrightness() {
    Object.keys(simradDisplayGroups).forEach(group => {
      let path = `electrical.displays.navico.${group}.brightness`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayBrightness(group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          const mapping = props.groupMappings.find((mapping:any) => {
            return mapping.simradGroup === group
          })
          if ( mapping ) {
            setRaymarineDisplayBrightness(mapping.raymarineGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              },
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${simradDisplayGroups[group]} Brightness`,
                  units: 'ratio',
                  range: [ 0, 1 ]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupSimradNightMode() {
    Object.keys(simradDisplayGroups).forEach(group => {
      let path = `electrical.displays.navico.${group}.nightMode.state`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayNightMode(group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          const mapping = props.groupMappings.find((mapping:any) => {
            return mapping.simradGroup === group
          })
          if ( mapping ) {
            setRaymarineDisplayNightMode(mapping.raymarineGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              },
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${simradDisplayGroups[group]} Night Mode`,
                  units: 'bool'
                }
              },
              {
                path: `electrical.displays.navico.${group}.nightMode`,
                value: {
                  displayName: `${simradDisplayGroups[group]} Night Mode`
                }
              }
            ]
          }
        ]
      })
    })
  }
  
  function setRaymarineDisplayBrightness(group:string, value:number) {
    app.emit('nmea2000JsonOut', {
      "prio":7,
      "pgn":126720,
      "dst":255,
      "fields": {
        "Manufacturer Code":"Raymarine",
        "Industry Code":"Marine Industry",
        "Proprietary ID":"0x0c8c",
        "Group":raymarineDisplayGroups[group],
        "Unknown 1":1,
        "Command":"Brightness",
        "Brightness": value * 100,
        "Unknown 2": 0,
      }
    })
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: `electrical.displays.raymarine.${group}.brightness`,
              value: value
            }
          ]
        }
      ]
    })
  }

  function setRaymarineDisplayColor(group:string, value:string)
  {
    let pgn =  {
      "prio":7,
      "pgn":126720,
      "dst":255,
      "fields":{
        "Manufacturer Code":"Raymarine",
        "Industry Code":"Marine Industry",
        "Proprietary ID":"0x0c8c",
        "Group":raymarineDisplayGroups[group],
        "Unknown 1":1,
        "Command":"Color",
        "Color":raymarineColorMap[value],
        "Unknown 2": 0,
      }
    }
    app.emit('nmea2000JsonOut',pgn)
  }

  function setRaymarineDisplayNightMode(group:string, value:number) {
    const dayColor = props.raymarineDayColor || 'day1'
    const nightColor = props.raymarineNightColor || 'red/black'
    setRaymarineDisplayColor(group, value === 1 ? nightColor : dayColor)
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: `electrical.displays.raymarine.${group}.nightMode.state`,
              value: value
            }
          ]
        }
      ]
    })
  }
  

  function setSimradDisplayBrightness(group:string, value:number)
  {
    app.emit('nmea2000JsonOut', {
      "prio":3,
      "pgn":130845,
      "dst":255,
      "fields":{
        "Manufacturer Code":"Simrad",
        "Industry Code":"Marine Industry",
        "Display Group":simradDisplayGroups[group],
        "Key":"Backlight level",
        "Spare":0,
        "MinLength":1,
        "Value":value*100}
    })
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: `electrical.displays.navico.${group}.brightness`,
              value: value
            }
          ]
        }
      ]
    })
  }

  function setSimradDisplayNightMode(group:string, value:number)
  {
    app.emit('nmea2000JsonOut', {
      "prio":3,
      "pgn":130845,
      "dst":255,
      "fields":{
        "Manufacturer Code":"Simrad",
        "Industry Code":"Marine Industry",
        "Display Group":simradDisplayGroups[group],
        "Key":"Night mode",
        "Spare":0,
        "MinLength":1,
        "Value":value == 1 ? 4 : 2}
    })
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: `electrical.displays.navico.${group}.nightMode.state`,
              value: value
            }
          ]
        }
      ]
    })
  }

  function setSimradDisplayNightColor(group:string, value:string)
  {
    app.emit('nmea2000JsonOut', {
      "prio":3,
      "pgn":130845,
      "dst":255,
      "fields":{
        "Manufacturer Code":"Simrad",
        "Industry Code":"Marine Industry",
        "Display Group":"Default",
        "Key":"Night mode color",
        "Spare":0,
        "MinLength":1,
        "Value":simradDisplayNightColors[value]}
    })
  }

  function subscribeToSimnet(properties:any) {
    let command = {
      context: "vessels.self",
      subscribe: [
        {
          path: `electrical.displays.navico.*`,
          period: 1000
        }
      ]
    }
    
    app.debug('subscribe %j', command)
    
    app.subscriptionmanager.subscribe(command, onStop, subscription_error, (delta:any) => {
      delta.updates.forEach((update:any) => {
        if ( update['$source'] !== plugin.id ) {
          if ( update.values ) {
            update.values.forEach((vp:any) => {
              const path = vp.path
              if ( !path ) {
                return
              }
              const value = vp.value
              const group = getDisplayGroupName(path)
              const mapping = properties.groupMappings.find((mapping:any) => {
                return mapping.simradGroup === group
              })
              if ( mapping ) {
                const key = getKeyName(path)
                const setter = raymarineSetter[key]
                if ( setter ) {
                  app.debug('Syncing simnet %s %s to raymarine %s == %j', group, key, mapping.raymarineGroup, value)
                  setter(mapping.raymarineGroup, value)
                }
              }
            })
          }
        }
      })
    })
  }

  function subscribeToRaymarine(properties:any) {
    let command = {
      context: "vessels.self",
      subscribe: [
        {
          path: `electrical.displays.raymarine.*`,
          period: 1000
        }
      ]
    }
    
    app.debug('subscribe raymarine %j', command)
    
    app.subscriptionmanager.subscribe(command, onStop, subscription_error, (delta:any) => {
      delta.updates.forEach((update:any) => {
        if ( update['$source'] !== plugin.id ) {
          if ( update.values ) {
            update.values.forEach((vp:any) => {
              const path = vp.path
              if ( !path ) {
                return
              }
              const value = vp.value
              const group = getDisplayGroupName(path)
              const mapping = properties.groupMappings.find((mapping:any) => {
                return mapping.raymarineGroup === group
              })
              const key = getKeyName(path)
              if ( mapping ) {
                const setter = simradSetter[key]
                if ( setter ) {
                  app.debug('Syncing raymarine %s %s to simnet %s == %j', group, key, mapping.raymarineGroup, value)
                  setter(mapping.simradGroup, value)
                }
              }
              if ( key === 'color' ) {
                let isNightMode = properties.raymarineNightColor ? (value === properties.raymarineNightColor?1:0) : (value === 'red/black'?1:0)
                app.handleMessage(plugin.id, {
                  updates: [
                    {
                      values: [
                        {
                          path: `electrical.displays.raymarine.${group}.nightMode.state`,
                          value: isNightMode
                        }
                      ]
                    }
                  ]
                })

                if ( mapping ) {
                  setSimradDisplayNightMode(mapping.simradGroup, isNightMode)
                }
              }
            })
          }
        }
      })
    })
  }

  const raymarineSetter: any = {
    'nightMode.state': setRaymarineDisplayNightMode,
    'brightness': setRaymarineDisplayBrightness
  }

  const simradSetter: any = {
    'nightMode.state': setSimradDisplayNightMode,
    'brightness': setSimradDisplayBrightness
  }

  function subscription_error(err:any)
  {
    app.setPluginError(err)
  }
  
  return plugin
}

const raymarineDisplayGroups: any = {
  'none': "None",
  'helm1': "Helm 1",
  'helm2': "Helm 2",
  'cockpit': "Cockpit",
  'flybridge': "Flybridge",
  'mast': "Mast",
  'group1': "Group 1",
  'group2': "Group 2",
  'group3': "Group 3",
  'group4': "Group 4",
  'group5': "Group 5"
}

const raymarineColorMap: any = {
  "day1": "Day 1",
  "day2": "Day 2",
  "red/black": "Red/Black",
  "inverse": "Inverse",
}

const simradDisplayGroups: any = {
  'default': "Default",
  'group1': "Group 1",
  'group2': "Group 2",
  'group3': "Group 3",
  'group4': "Group 4",
  'group5': "Group 5",
  'group6': "Group 6",
}

const simradDisplayNightColors: any = {
  'red': 0,
  'green': 1,
  'blue': 2,
  'white': 3,
  'magenta': 4
}

interface Plugin {
  start: (app: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}

