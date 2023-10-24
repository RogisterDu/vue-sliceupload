/*
 * @Description: 大文件上传、分片上传、断点续传、文件秒传
 * @Author: zhangy
 * @Date: 2022-05-16 13:10:13
 * @LastEditors: zhangy
 * @LastEditTime: 2022-05-19 10:14:33
 */

const SparkMD5 = require('spark-md5')
import { getUploadStatus, sliceUpload, mergeUpload } from '@/api/chunksUploadAPI'
// 切片大小(单位:B)
const CHUNK_SIZE = 5 * 1024 * 1024

/**
 * @description: 分块计算文件的md5值
 * @param {*} file 文件
 * @param {*} chunkSize 分片大小
 * @returns {*}
 */
function calculateFileMd5(file, chunkSize) {
  return new Promise((resolve, reject) => {
    const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice
    const chunks = Math.ceil(file.size / chunkSize)
    let currentChunk = 0
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    fileReader.onload = function(e) {
      spark.append(e.target.result)
      currentChunk++
      if (currentChunk < chunks) {
        loadNext()
      } else {
        const md5 = spark.end()
        resolve(md5)
      }
    }

    fileReader.onerror = function(e) {
      reject(e)
    }

    function loadNext() {
      const start = currentChunk * chunkSize
      let end = start + chunkSize
      if (end > file.size) {
        end = file.size
      }
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
    }

    loadNext()
  })
}

/**
 * @description: 分块计算文件的md5值
 * @param {*} file 文件
 * @returns {Promise}
 */
function calculateFileMd5ByDefaultChunkSize(file) {
  return calculateFileMd5(file, CHUNK_SIZE)
}

/**
 * @description: 文件切片
 * @param {*} file
 * @param {*} size 切片大小
 * @returns [{file}]
 */
function createFileChunk(file, size = CHUNK_SIZE) {
  const chunks = []
  let cur = 0
  while (cur < file.size) {
    chunks.push({ file: file.slice(cur, cur + size) })
    cur += size
  }
  return chunks
}

/**
 * @description: 获取文件的后缀名
 */
function getFileType(fileName) {
  return fileName.substr(fileName.lastIndexOf('.') + 1).toLowerCase()
}

/**
 * @description: 根据文件的md5值判断文件是否已经上传过了
 * @param {*} md5 文件的md5
 * @param {*} 准备上传的文件
 * @returns {Promise}
 */
function checkMd5(md5, file) {
  return new Promise(resolve => {
    getUploadStatus({ md5 })
      .then(res => {
        if (res.data.code === 20000) {
          // 文件已经存在了，秒传（后端直接返回已上传的文件）
          resolve({
            uploaded: true,
            url: res.data.msg,
            code: res.data.code
          })
        } else if (res.data.code === 40004) {
          // 文件不存在需要上传
          resolve({ uploaded: false, url: '', code: res.data.code })
        } else {
          resolve({ uploaded: false, url: '', code: 500 })
        }
      })
      .catch(() => {
        resolve({ uploaded: false, url: '', code: 500 })
      })
  })
}

/**
 * @description: 执行分片上传
 * @param {*} file 上传的文件
 * @param {*} i 第几分片，从0开始
 * @param {*} md5 文件的md5值
 * @param {*} vm 虚拟 dom 指向组件 this
 * @returns {Promise}
 */
function PostFile(file, i, md5, vm) {
  const name = file.name // 文件名
  const size = file.size // 总大小
  const shardCount = Math.ceil(size / CHUNK_SIZE) // 总片数
  if (i >= shardCount) {
    return
  }

  const start = i * CHUNK_SIZE
  const end = start + CHUNK_SIZE
  const packet = file.slice(start, end) // 将文件进行切片
  /*  构建form表单进行提交  */
  const form = new FormData()
  form.append('md5', md5) // 前端生成uuid作为标识符传个后台每个文件都是一个uuid防止文件串了
  form.append('file', packet) // slice方法用于切出文件的一部分
  form.append('name', name)
  form.append('totalSize', size)
  form.append('total', shardCount) // 总片数
  form.append('index', i + 1) // 当前是第几片
  return new Promise((resolve, reject) => {
    sliceUpload(form)
      .then(res => {
        if (res.data.code === 20001) {
          // 拿到已上传过的切片
          resolve({
            uploadedList: res.data.chunkList ? res.data.chunkList.map(item => `${md5}-${item}`) : []
          })
        } else if (res.data.code === 20002) {
          resolve({ uploadedList: [] })
        } else {
          resolve({ uploadedList: [], code: 500 })
          // reject()
        }
      })
      .catch(() => {
        // reject()
        resolve({ uploadedList: [], code: 500 })
      })
  })
}

/**
 * @description: 合并文件
 * @param {*} shardCount 分片数
 * @param {*} fileName 文件名
 * @param {*} md5 文件md值
 * @param {*} fileType 文件类型
 * @param {*} fileSize 文件大小
 * @returns {Promise}
 */
function merge(shardCount, fileName, md5, fileType, fileSize) {
  return mergeUpload({ shardCount, fileName, md5, fileType, fileSize })
}

export default {
  data() {
    return {
      chunks: [],
      percent: 0,
      percentCount: 0,
      stopUpload: false // 在需要的时机或场合阻止上传
    }
  },
  methods: {
    /**
     * @description: 上传文件
     * @param {*} file 文件
     * @returns {Object} 包含成功的文件地址、名称等
    */
    async chunksUpload(file) {
      this.chunks = []

      // step1 获取文件切片
      const initChunks = createFileChunk(file)
      // step2 获取文件 md5 值
      const md5 = await calculateFileMd5ByDefaultChunkSize(file)
      // step3 获取文件的上传状态
      const { uploaded, url, code } = await checkMd5(md5, file)

      if (uploaded) {
        // step4 如果上传成功
        this.percent = 100

        // step5 拿到结果
        return url
      }

      if (!uploaded && code === 500) {
        return this.errorInfo()
      }

      // step4 如果文件未传成功，执行切片上传
      const { uploadedList } = await PostFile(file, 0, md5, this)

      // todo 方法1：逐次发送请求
      const requestList = [] // 请求集合
      initChunks.forEach(async(chunk, index) => {
        // 过滤掉已上传的切片
        if (uploadedList.indexOf(md5 + '-' + (index + 1)) < 0) {
          const fn = () => {
            return PostFile(file, index, md5, this)
          }
          requestList.push(fn)
        }
      })

      let reqNum = 0 // 记录发送的请求个数
      const send = async() => {
        if (reqNum >= requestList.length) {
          // step5 如果所有切片已上传，执行合并
          const res = await merge(initChunks.length, file.name, md5, getFileType(file.name), file.size)
          if (res.data.code === 20000) {
            return res.data.msg
          } else {
            this.errorInfo()
            return {}
          }
        }
        
        if (this.stopUpload) return {} // 阻止上传
        const sliceRes = await requestList[reqNum]()
        if (sliceRes.code && sliceRes.code === 500) {
          return this.errorInfo()
        }
        // 计算当下所上传切片数
        const count = initChunks.length - uploadedList.length
        if (this.percentCount === 0) {
          this.percentCount = 100 / count
        }
        this.percent += this.percentCount
        reqNum++
        return send()
      }

      const mergeResult = await send()
      return mergeResult

      // todo 方法2：使用Promise.all 统一发送请求
      // const requestList = initChunks.map(async(chunk, index) => {
      //   // 过滤掉已上传的切片
      //   if (uploadedList.indexOf(md5 + '-' + (index + 1)) < 0) {
      //     return PostFile(file, index, md5, this)
      //   }
      // })

      // return Promise.all(requestList)
      //   .then(async() => {
      //     const res = await merge(initChunks.length, file.name, md5, getFileType(file.name), file.size)
      //     if (res.data.code === 20000) {
      //       return res.data.msg
      //     }
      //   })
      //   .catch(() => {
      //     return this.$message.error('出错了，请稍后重试！')
      //   })
    },

    /**
     * @description: 错误提示
    */
    errorInfo() {
      this.$message.error('出错了，请稍后重试！')
    }
  }
}