const WHITE_SPACE = ' '
const QUOTE_MARK = '"'
const COMMA_MARK = ','
const L_BRACKET = '('
const CONDITION_AND = 'and'
const CONDITION_OR = 'or'
const KW_TIME = 'time'

const EMPTY_QUERY = {
  db: '',
  database: '',
  from: '',
  whereObj: {
    AND: [],
    OR: [],
    TAG: [],
  },
}

const simpleSelect = function (idx, gap, arr) {
  return idx >= 0 ? arr[idx + gap] : null
}

const getStrBeforeComma = function (str) {
  const endsWithComma = /"([^"]+)",?$/.test(str)
  if (!endsWithComma)
    return ''

  let strWithinQuotes = str.match(/"([^"]+)",?/)[1]
  return strWithinQuotes
}

const extractStrBetweenQuotes = function (str) {
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
  if (str.indexOf(QUOTE_MARK) >= 0) {
    field = getStrBeforeComma(str)
    return field
  }

  field = str.split(COMMA_MARK)[0]
  return field
}

const getFunc = function (str) {
  let func = ''
  if (str.indexOf(L_BRACKET) >= 0) {
    func = str.split(L_BRACKET)[0].toUpperCase()
  }

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

const includesKey = function (arr = [], key) {
  return [',', ...arr]
    .join(' ,')
    .toLowerCase()
    .indexOf(`,${key} ,`) >= 0
}

const isField = function (_field, fieldArr = []) {
  let field = extractStrBetweenQuotes(_field)
  let result = fieldArr.filter(el => el[0].indexOf(field) >= 0)
  return result.length > 0
}

const getCondStr = function (str) {
  let f = extractStrBetweenQuotes(str)
  return f.replace(/(')/g, '')
}

const replaceQuotes = function (str) {
  return str.replace(/('|")/g, '')
}

const extractCond = function (arr, fieldArr) {
  if (arr.length === 3) {
    let isTag = !isField(arr[0], fieldArr)
    let param1 = getCondStr(arr[0])
    let operator = arr[1]
    let param2 = getCondStr(arr[2])
    return [param1, operator, param2, isTag]
  }

  let str = arr.join('')
  let operator = str.match(/[!|>!<|=]+/g)[0]
  let [_param1, _param2] = str.split(operator)
  let param1 = replaceQuotes(_param1)
  let param2 = replaceQuotes(_param2)
  let isTag = !isField(param1, fieldArr)
  return [param1, operator, param2, isTag]
}

// deal with queries like 'select idle as "id,le",system as "sys"'
const rearrangeSelects = function (_selects = [], _origSelects = []) {
  let selects = _selects.slice(),
    origSelects = _origSelects.slice()

  for (let idx = 0; idx < selects.length;) {
    let el = selects[idx]
    if (el.indexOf(COMMA_MARK) < 0) {
      idx++
    } else {
      let tmpArr = el.split(COMMA_MARK),
        arr = origSelects[idx].split(COMMA_MARK)

      let toInsert = tmpArr.pop(),
        _new = arr.pop()

      selects = [
        ...selects.slice(0, idx),
        tmpArr.join(''),
        toInsert,
        ...selects.slice(idx + 1),
      ]
      origSelects = [
        ...origSelects.slice(0, idx),
        arr.join(''),
        _new,
        ...origSelects.slice(idx + 1),
      ]

      idx += 2
    }
  }
  return [selects, origSelects]
}

const getFieldSet = function (_selects, _origSelects) {
  let [selects, origSelects] = rearrangeSelects(_selects, _origSelects)
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
      _as = '',
      func = ''

    if (len === 1) {
      let fStr = fArr[0]
      field = getField(fStr)
    } else if (len === 3) {
      func = getFunc(fArr[0])
      field = getFieldFromAggregateFuncStr(fArr[0])
      _as = getField(fArr[2])
    }

    field && fieldSet.push({
      func,
      field,
      as: _as,
    })

    return null
  })

  return [fieldArr, fieldSet]
}

const getFrom = function (fromStr) {
  let fromArr = fromStr.split('.')

  if (fromArr.length !== 3) {
    throw new Error('Wrong from format.')
  }

  let db = extractStrBetweenQuotes(fromArr[0])
  let rp = extractStrBetweenQuotes(fromArr[1])
  let from = extractStrBetweenQuotes(fromArr[2])
  return [db, rp, from]
}

const getGroupBy = function (qArr) {
  let groupBy = ''

  let gbIdx = qArr.indexOf('group')
  let gBStr = qArr[gbIdx + 2]

  let isValidGb = validateGb(gBStr)
  if (isValidGb) {
    groupBy = extractGb(gBStr)
  }

  return groupBy
}

const makeWhereArr = function (and = [], or = [], fieldArr) {
  let AND = [], OR = [], TAG = []
  let andLen = and.length

  let arrSet = [...and, ...or]
  arrSet.map(function (arr, idx) {
    let [param1, operator, param2, isTag] = extractCond(arr, fieldArr)
    if (isTag) {
      TAG.push({
        tagKey: param1,
        tagValue: param2,
        operator,
      })
    } else {
      if (idx < andLen) {
        AND.push({
          param1,
          param2,
          operator,
        })
      } else {
        OR.push({
          param1,
          param2,
          operator,
        })
      }
    }

    return null
  })

  return {
    AND,
    OR,
    TAG,
  }
}

const getAndnOR = function (whereArr, srcWhereArr) {
  let andArr = [],
    orArr = []

  let breaks = whereArr
    .map(function (e, i) {
      if (e === CONDITION_AND || e === CONDITION_OR) {
        return i
      }
      return -1
    })
    .filter(e => e > 0)

  andArr.push(srcWhereArr.slice(0, breaks[0]))

  for (let i = 0; i < breaks.length; i++) {
    let lIdx = breaks[i]
    let rIdx = breaks[i + 1]
    let cond = whereArr[lIdx]
    let next = srcWhereArr.slice(lIdx + 1, rIdx)
    cond === CONDITION_AND && andArr.push(next)
    cond === CONDITION_OR && orArr.push(next)
  }

  // ignore keyword *time*
  let ands = andArr.filter(e => !includesKey(e, KW_TIME))
  let ors = orArr.filter(e => !includesKey(e, KW_TIME))

  return [ands, ors]
}

const parser = function (rawStr) {
  let query = { ...EMPTY_QUERY }

  let _raw = rawStr.trim().replace(/\s+/g, WHITE_SPACE)
  let raw = removeSpacesWithQuotes(_raw)

  let srcArr = raw.split(WHITE_SPACE)
  let qArr = raw.toLowerCase().split(WHITE_SPACE)

  let fromIdx = qArr.indexOf('from')

  let selects = qArr.slice(1, fromIdx)
  let origSelects = srcArr.slice(1, fromIdx)

  let [fieldArr, fieldSet] = getFieldSet(selects, origSelects)
  query.fieldSet = fieldSet

  let fromStr = srcArr[fromIdx + 1]
  let [db, retentionPolicy, from] = getFrom(fromStr)
  query.db = query.database = db
  query.retentionPolicy = retentionPolicy
  query.from = from

  query.groupBy = getGroupBy(qArr)

  let sOfWhere = qArr.indexOf('where')
  let limitIdx = qArr.indexOf('limit')
  let slimitIdx = qArr.indexOf('slimit')
  let offsetIdx = qArr.indexOf('offset')
  let soffsetIdx = qArr.indexOf('soffset')
  let gbIdx = qArr.indexOf('group')
  let orderIdx = qArr.indexOf('order')

  query.limit = simpleSelect(limitIdx, 1, qArr)
  query.slimit = simpleSelect(slimitIdx, 1, qArr)
  query.offset = simpleSelect(offsetIdx, 1, qArr)
  query.soffset = simpleSelect(soffsetIdx, 1, qArr)
  query.orderBy = simpleSelect(orderIdx, 3, qArr)

  let eOfWhere = [
    limitIdx,
    slimitIdx,
    offsetIdx,
    soffsetIdx,
    orderIdx,
    gbIdx,
  ]
    .filter(e => e > 0)
    .sort()[0]

  if (sOfWhere >= 0) {
    let whereArr = qArr.slice(sOfWhere + 1, eOfWhere)
    let srcWhereArr = srcArr.slice(sOfWhere + 1, eOfWhere)

    let arrs = getAndnOR(whereArr, srcWhereArr)
    query.whereObj = makeWhereArr(...arrs, fieldArr)
  }

  return query
}

export default parser


// export default parser

// let sample = `
//     SELECT "Disk_Read_Bytes_persec" as "Disk_Read_Bytes_persec" FROM "telegraf".""."win_diskio"
//   `

// console.time('parse')
// let query = parser(sample)
// console.timeEnd('parse')
// console.log('done')

