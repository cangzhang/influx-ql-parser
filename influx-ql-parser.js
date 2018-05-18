const QUTOE_MARK = '"'
const COMMA_MARK = ','
const PERIOD_MARK = '.'
const L_BRACKET = '('
const R_BRACKET = ')'

const getStrBeforeComma = function (str) {
  const endsWithComma = /"([^"]+)",?$/.test(str)
  if (!endsWithComma)
    return ''

  let strWithinQuotes = str.match(/"([^"]+)",?/)[1]
  return strWithinQuotes
}

const extractStrWithinQuotes = function (str) {
  const hasQuote = str.indexOf('"') >= 0
  return hasQuote ? str.match(/"(.*?)"/)[1] : str
}

const removeSpacesWithQuotes = function (str) {
  return str.replace(/"([^"]+)"|'([^']+)'/g, function (m) {
    return m.replace(/\s/g, '')
  })
}

const getField = function (str) {
  let field = ''
  if (str.indexOf(QUTOE_MARK) >= 0) {
    field = getStrBeforeComma(str)
    return field
  }

  field = str.split(COMMA_MARK)[0]
  return field
}

const getFunc = function (str) {
  let func = str.split(L_BRACKET)[0].toUpperCase()
  return func || ''
}

const getFieldFromAggregateFuncStr = function (_str) {
  let raw = _str
  if (_str.indexOf(L_BRACKET) >= 0) {
    raw = _str.match(/\(+(.*?)\)+/)[1]
  }
  let field = getField(raw)
  return field
}

const validateGb = function (str) {
  return /time\(\d+[w|d|h|m|s]\)$/.test(str)
}

const extractGb = function (str) {
  return str.match(/\d+[w|d|h|m|s]/g)[0]
}




let sample = `
  SELECT last("usage_idle") AS "    last_usage,idle",
    mean("usage_user") AS "USER",
    ((usage_system)) as system
  FROM "telegraf".autogen."cpu" 
  WHERE usage_idle >    100 
      AND time > now() - 1h 
  GROUP BY time(10s)
`

let _raw = sample.trim().replace(/\s+/g, ' ')
let raw = removeSpacesWithQuotes(_raw)

let srcArr = raw.split(' ')
let qArr = raw.toLowerCase().split(' ')

let query = {}

let start = qArr.indexOf('select')

if (start !== 0) {
  throw new Error(`Query must start with 'select/SELECT'.`)
}

let fromIdx = qArr.indexOf('from')

let selects = qArr.slice(1, fromIdx)
let origSelects = srcArr.slice(1, fromIdx)

// if (!selects.length) {
//   throw new Error(`No field(s) selected.`)
// }
// if (selects.length % 3 > 1) {
//   throw new Error(`Wrong fields input.`)
// }

let fieldArr = []
for (let idx = 0; idx < selects.length;) {
  if (selects[idx + 1] === 'as') {
    let field = origSelects.slice(idx, idx + 3)
    fieldArr.push(field)
    idx += 3
  } else {
    let field = origSelects[idx]
    field.length && fieldArr.push([field])
    idx++
  }
}

let fieldSet = []
fieldArr.map(function (fArr) {
  let len = fArr.length
  let field = '',
    as = '',
    func = ''

  if (len === 1) {
    let fStr = fArr[0]
    field = getField(fStr)
  } else if (len === 3) {
    func = getFunc(fArr[0])
    field = getFieldFromAggregateFuncStr(fArr[0])
    as = getField(fArr[2])
  }

  field && fieldSet.push({
    func,
    field,
    as,
  })

  return null
})

query.fieldSet = fieldSet

let fromStr = srcArr[fromIdx + 1]
let fromArr = fromStr.split('.')

if (fromArr.length !== 3) {
  throw new Error('Wrong from format.')
}

query.db = query.database = extractStrWithinQuotes(fromArr[0])
query.retentionPolicy = extractStrWithinQuotes(fromArr[1])
query.from = extractStrWithinQuotes(fromArr[2])


let groupBy = ''
let gbIdx = qArr.indexOf('group')
let gBStr = qArr[gbIdx + 2]
let isValidGb = validateGb(gBStr)

if (isValidGb) {
  groupBy = extractGb(gBStr)
}

groupBy && (query.groupBy = groupBy)


console.log(query)

let whereIdx = qArr.indexOf('where')
let obIdx = qArr.indexOf('order')
let limitIdx = qArr.indexOf('limit')