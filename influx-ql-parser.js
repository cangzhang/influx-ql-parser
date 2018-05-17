const removeSpacesWithQuotes = function (str) {
  return str.replace(/"([^"]+)"|'([^']+)'/g, function (m) {
    return m.replace(/\s/g, '')
  })
}

let sample = `
  SELECT last("usage_idle") AS "    last_usage_idle",
    mean("usage_user") AS user,
    usage_system
  FROM "telegraf"."autogen"."cpu" 
  WHERE usage_idle >    100 
      AND time > now() - 1h 
  GROUP BY time(10s)
`

let _raw = sample.trim().replace(/\s+/g, ' ')
let raw = removeSpacesWithQuotes(_raw)

let srcArr = raw.split(' ')
let qArr = raw.toLowerCase().split(' ')

let start = qArr.indexOf('select')

if (start !== 0) {
  throw new Error(`Query must start with 'select/SELECT'`)
}

let fromIdx = qArr.indexOf('from')
let selects = qArr.slice(1, fromIdx)
let origSelects = srcArr.slice(1, fromIdx)

if (!selects.length) {
  throw new Error(`No field(s) selected!`)
}
if (selects.length % 3 > 1) {
  throw new Error(`Wrong fields input!`)
}




