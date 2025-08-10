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

import {
  PGN,
  PGN_126720_Seatalk1DisplayBrightness,
  PGN_126720_Seatalk1DisplayColor,
  PGN_130845_SimnetKeyValue,
  SeatalkNetworkGroup,
  SeatalkDisplayColor,
  SimnetDisplayGroup,
  SimnetNightModeColor,
  convertCamelCase
} from '@canboat/ts-pgns'

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let props: any
  let onStop: any = []

  const plugin: Plugin = {
    start: function (properties: any) {
      props = properties
      setupRaymarineBrightness()
      setupRaymarineColor()
      setupRaymarineNightMode()

      setupSimradBrightness()
      setupSimradNightColor()
      setupSimradNightMode()

      if (properties.groupMappings && properties.groupMappings.length > 0) {
        subscribeToSimnet(properties)
        subscribeToRaymarine(properties)
      }

      app.on('nmea2000OutAvailable', () => {
        app.debug('requesting Raymarine display info...')
        app.emit(
          'nmea2000out',
          '2024-06-28T14:51:57.933Z,2,126720,0,255,12,3b,9f,8c,10,03,01,3C,00,B0,04,FF,FF'
        )
      })
    },

    stop: function () {
      onStop.forEach((f: any) => f())
      onStop = []
    },

    id: 'signalk-n2k-displays',
    name: 'NMEA 2000 Display Control',
    description:
      'Signal K Plugin that controls and syncs display devices from Raymarine and Navico devices',

    schema: () => {
      const schema: any = {
        type: 'object',
        required: ['raymarineDayColor', 'raymarineNightColor'],
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
          navicoGroups: {
            title: 'Enabled Navico Groups',
            type: 'object',
            properties: {}
          },
          raymarineGroups: {
            title: 'Enabled Raymarine Groups',
            type: 'object',
            properties: {}
          },
          groupMappings: {
            title: 'Display Group Mappings',
            description:
              'If you setup a mapping, the display settings will be kept in sync between your Raymarine and Navico devices in those groups',
            type: 'array',
            items: {
              type: 'object',
              required: ['raymarineGroup', 'simradGroup'],
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
                }
              }
            }
          }
        }
      }
      Object.keys(simradDisplayGroups).forEach(key => {
        let name = simradDisplayGroups[key]
        schema.properties.navicoGroups.properties[key] = {
          type: 'boolean',
          title: `${name}`,
          default: true
        }
      })
      Object.keys(raymarineDisplayGroups).forEach(key => {
        let name = raymarineDisplayGroups[key]
        schema.properties.raymarineGroups.properties[key] = {
          type: 'boolean',
          title: `${name}`,
          default: true
        }
      })
      return schema
    }
  }

  function getDisplayGroupName (path: string) {
    //electrical.displays.simrad.default.brightness
    let parts = path.split('.')
    return parts[3]
  }

  function getKeyName (path: string) {
    let parts = path.split('.')
    if (parts[parts.length - 1] === 'state') {
      return parts[parts.length - 2] + '.' + parts[parts.length - 1]
    } else {
      return parts[parts.length - 1]
    }
  }

  function setupRaymarineColor () {
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
              }
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

  function setupRaymarineBrightness () {
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

          const mapping = props.groupMappings.find((mapping: any) => {
            return mapping.raymarineGroup === group
          })
          if (mapping) {
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
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${raymarineDisplayGroups[group]} Brightness`,
                  units: 'ratio',
                  range: [0, 1]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupRaymarineNightMode () {
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        props.raymarineGroups !== undefined &&
        props.raymarineGroups[group] !== undefined &&
        props.raymarineGroups[group] === false
      ) {
        return
      }

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
          const mapping = props.groupMappings.find((mapping: any) => {
            return mapping.raymarineGroup === group
          })
          if (mapping) {
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
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `Raymarine ${raymarineDisplayGroups[group]} Night Mode`,
                  units: 'bool'
                }
              },
              {
                path: `electrical.displays.raymarine.${group}.nightMode`,
                value: {
                  displayName: `Raymarin ${raymarineDisplayGroups[group]} Night Mode`
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupSimradNightColor () {
    Object.keys(simradDisplayGroups).forEach(group => {
      if (
        props.navicoGroups !== undefined &&
        props.navicoGroups[group] !== undefined &&
        props.navicoGroups[group] === false
      ) {
        return
      }
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
              }
            ],
            meta: [
              {
                path,
                value: {
                  path,
                  value: {
                    displayName: `${simradDisplayGroups[group]} Night Color`,
                    possibleValues: [
                      ...Object.keys(simradDisplayNightColors).map(
                        (color: any) => {
                          return {
                            title:
                              color.charAt(0).toUpperCase() + color.slice(1),
                            value: color
                          }
                        }
                      )
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

  function setupSimradBrightness () {
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
          const mapping = props.groupMappings.find((mapping: any) => {
            return mapping.simradGroup === group
          })
          if (mapping) {
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
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${simradDisplayGroups[group]} Brightness`,
                  units: 'ratio',
                  range: [0, 1]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupSimradNightMode () {
    Object.keys(simradDisplayGroups).forEach(group => {
      if (
        props.navicoGroups !== undefined &&
        props.navicoGroups[group] !== undefined &&
        props.navicoGroups[group] === false
      ) {
        return
      }

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
          const mapping = props.groupMappings.find((mapping: any) => {
            return mapping.simradGroup === group
          })
          if (mapping) {
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
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `Navico ${simradDisplayGroups[group]} Night Mode`,
                  units: 'bool'
                }
              },
              {
                path: `electrical.displays.navico.${group}.nightMode`,
                value: {
                  displayName: `Navico ${simradDisplayGroups[group]} Night Mode`
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setRaymarineDisplayBrightness (group: string, value: number) {
    app.emit(
      'nmea2000JsonOut',
      convertCamelCase(
        app,
        new PGN_126720_Seatalk1DisplayBrightness({
          group: raymarineDisplayGroups[group],
          unknown1: 1,
          brightness: value * 100,
          unknown2: 0
        })
      )
    )

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

  function setRaymarineDisplayColor (group: string, value: string) {
    let pgn = convertCamelCase(
      app,
      new PGN_126720_Seatalk1DisplayColor({
        group: raymarineDisplayGroups[group],
        unknown1: 1,
        color: raymarineColorMap[value],
        unknown2: 0
      })
    )
    app.emit('nmea2000JsonOut', pgn)
  }

  function setRaymarineDisplayNightMode (group: string, value: number) {
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

  function setSimradDisplayBrightness (group: string, value: number) {
    app.emit(
      'nmea2000JsonOut',
      convertCamelCase(
        app,
        new PGN_130845_SimnetKeyValue({
          displayGroup: simradDisplayGroups[group],
          key: 'Backlight level',
          spare9: 0,
          minlength: 1,
          value: value * 100
        })
      )
    )

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

  function setSimradDisplayNightMode (group: string, value: number) {
    app.emit(
      'nmea2000JsonOut',
      convertCamelCase(
        app,
        new PGN_130845_SimnetKeyValue({
          displayGroup: simradDisplayGroups[group],
          key: 'Night mode',
          spare9: 0,
          minlength: 1,
          value: value == 1 ? 4 : 2
        })
      )
    )

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

  function setSimradDisplayNightColor (group: string, value: string) {
    app.emit(
      'nmea2000JsonOut',
      convertCamelCase(
        app,
        new PGN_130845_SimnetKeyValue({
          displayGroup: simradDisplayGroups[group],
          key: 'Night mode color',
          spare9: 0,
          minlength: 1,
          value: simradDisplayNightColors[value]
        })
      )
    )
  }

  function subscribeToSimnet (properties: any) {
    let command = {
      context: 'vessels.self',
      subscribe: [
        {
          path: `electrical.displays.navico.*`,
          period: 1000
        }
      ]
    }

    app.debug('subscribe %j', command)

    app.subscriptionmanager.subscribe(
      command,
      onStop,
      subscription_error,
      (delta: any) => {
        delta.updates.forEach((update: any) => {
          if (update['$source'] !== plugin.id) {
            if (update.values) {
              update.values.forEach((vp: any) => {
                const path = vp.path
                if (!path) {
                  return
                }
                const value = vp.value
                const group = getDisplayGroupName(path)
                const mapping = properties.groupMappings.find(
                  (mapping: any) => {
                    return mapping.simradGroup === group
                  }
                )
                if (mapping) {
                  const key = getKeyName(path)
                  const setter = raymarineSetter[key]
                  if (setter) {
                    app.debug(
                      'Syncing simnet %s %s to raymarine %s == %j',
                      group,
                      key,
                      mapping.raymarineGroup,
                      value
                    )
                    setter(mapping.raymarineGroup, value)
                  }
                }
              })
            }
          }
        })
      }
    )
  }

  function subscribeToRaymarine (properties: any) {
    let command = {
      context: 'vessels.self',
      subscribe: [
        {
          path: `electrical.displays.raymarine.*`,
          period: 1000
        }
      ]
    }

    app.debug('subscribe raymarine %j', command)

    app.subscriptionmanager.subscribe(
      command,
      onStop,
      subscription_error,
      (delta: any) => {
        delta.updates.forEach((update: any) => {
          if (update['$source'] !== plugin.id) {
            if (update.values) {
              update.values.forEach((vp: any) => {
                const path = vp.path
                if (!path) {
                  return
                }
                const value = vp.value
                const group = getDisplayGroupName(path)
                const mapping = properties.groupMappings.find(
                  (mapping: any) => {
                    return mapping.raymarineGroup === group
                  }
                )
                const key = getKeyName(path)
                if (mapping) {
                  const setter = simradSetter[key]
                  if (setter) {
                    app.debug(
                      'Syncing raymarine %s %s to simnet %s == %j',
                      group,
                      key,
                      mapping.raymarineGroup,
                      value
                    )
                    setter(mapping.simradGroup, value)
                  }
                }
                if (key === 'color') {
                  let isNightMode = properties.raymarineNightColor
                    ? value === properties.raymarineNightColor
                      ? 1
                      : 0
                    : value === 'red/black'
                    ? 1
                    : 0
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

                  if (mapping) {
                    setSimradDisplayNightMode(mapping.simradGroup, isNightMode)
                  }
                }
              })
            }
          }
        })
      }
    )
  }

  const raymarineSetter: any = {
    'nightMode.state': setRaymarineDisplayNightMode,
    brightness: setRaymarineDisplayBrightness
  }

  const simradSetter: any = {
    'nightMode.state': setSimradDisplayNightMode,
    brightness: setSimradDisplayBrightness
  }

  function subscription_error (err: any) {
    app.setPluginError(err)
  }

  return plugin
}

const raymarineDisplayGroups: { [key: string]: SeatalkNetworkGroup } = {
  none: SeatalkNetworkGroup.None,
  helm1: SeatalkNetworkGroup.Helm1,
  helm2: SeatalkNetworkGroup.Helm2,
  cockpit: SeatalkNetworkGroup.Cockpit,
  flybridge: SeatalkNetworkGroup.Flybridge,
  mast: SeatalkNetworkGroup.Mast,
  group1: SeatalkNetworkGroup.Group1,
  group2: SeatalkNetworkGroup.Group2,
  group3: SeatalkNetworkGroup.Group3,
  group4: SeatalkNetworkGroup.Group4,
  group5: SeatalkNetworkGroup.Group5
}

const raymarineColorMap: { [key: string]: SeatalkDisplayColor } = {
  day1: SeatalkDisplayColor.Day1,
  day2: SeatalkDisplayColor.Day2,
  'red/black': SeatalkDisplayColor.Redblack,
  inverse: SeatalkDisplayColor.Inverse
}

const simradDisplayGroups: { [key: string]: SimnetDisplayGroup } = {
  default: SimnetDisplayGroup.Default,
  group1: SimnetDisplayGroup.Group1,
  group2: SimnetDisplayGroup.Group2,
  group3: SimnetDisplayGroup.Group3,
  group4: SimnetDisplayGroup.Group4,
  group5: SimnetDisplayGroup.Group5,
  group6: SimnetDisplayGroup.Group6
}

const simradDisplayNightColors: {
  [key: string]: SimnetNightModeColor | number
} = {
  red: SimnetNightModeColor.Red,
  green: SimnetNightModeColor.Green,
  blue: SimnetNightModeColor.Blue,
  white: SimnetNightModeColor.White,
  magenta: 4
}

interface Plugin {
  start: (app: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}
