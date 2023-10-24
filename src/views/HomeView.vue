<template>
  <div>
    <el-upload
      class="upload-demo"
      ref="upload"
      action
      :on-remove="handleRemove"
      :file-list="fileList"
      :limit="1"
      :before-upload="beforeUpload"
      :auto-upload="false"
      :on-change="handleChange"
      drag
    >
      <i class="el-icon-upload"></i>
      <div class="el-upload__tip" slot="tip">
        只能上传jpg/png文件，且不超过500kb
      </div>
      <div slot="tip" class="el-upload__tip">不能超过100M</div>
    </el-upload>
    <el-button
      style="margin-left: 10px"
      size="small"
      type="success"
      :disabled="!finishSlice"
      @click="submitUpload"
    >
      {{ uploading ? "上传中" : "上传到服务器" }}
    </el-button>
    <el-progress
      type="circle"
      :percent="Math.round((finishCount / sliceCount) * 100)"
      :status="finishCount === sliceCount ? 'success' : 'active'"
      v-if="showProcess"
    ></el-progress>
  </div>
</template>

<script>
import SparkMD5 from "spark-md5";
import axios from "axios";
import { uploadslice, requestmerge } from "../api/file.js";
export default {
  data() {
    return {
      // 文件列表
      fileList: [],
      // 上传状态
      uploading: false,
      // 分片完成情况
      finishSlice: false,
      // 完成上传的分片数量
      finishCount: 0,
      // 展示上传进度条
      showProcess: false,
      // 切片数量
      sliceCount: 0,
      // 切片进度条
      sliceProgress: 0,
      // 上传失败的数量
      errorCount: 0,
      // 展示切片进度条
      showSliceProgress: false,
      // 切片列表
      fileChunkList: [],
      // 发送的切片数量
      sendCount: [],
      // 文件类型
      filetype: [],
      // 文件名
      filename: [],
      // 文件 hash 值
      hash: "",
    };
  },
  methods: {
    beforeUpload(file) {
      console.log(file);
    },
    handleRemove() {},
    submitUpload() {
      console.log("开始上传");
      let that = this;
      return new Promise((resolve, reject) => {
        // 递归出口 分片上传完毕
        const next = () => {
          console.log("next");
          if (that.finishCount + that.errorCount >= that.sliceCount) {
            console.log(" // 递归出口 分片上传完毕");
            return;
          }
          // 记录当前遍历位置
          let cur = that.sendCount++;
          // 说明越界了 直接退出
          if (cur >= that.sliceCount) {
            console.log("说明越界了 直接退出");
            return;
          }
          let content = this.fileChunkList[cur];
          if (content.status === true) {
            if (that.finishCount + that.errorCount < that.sliceCount) {
              next();
              return;
            }
          }
          // 开始填充上传数据 这里需要使用 FormData 来存储信息
          const formData = new FormData();
          formData.append("file", content.chunk);
          // formData.append("hash", content.hash);
          // formData.append("filename", content.filename);
          // formData.append("seq", content.seq);
          // formData.append("type", content.type);
          // console.log("111", {
          //   file: content.chunk,
          //   hash: content.hash,
          //   filename: content.filename,
          //   seq: content.seq,
          //   type: content.type,
          // });
          const params = {
            hash: content.hash,
            filename: content.filename,
            seq: content.seq,
            type: content.type,
          };

          // 开始上传
          uploadslice(formData, params)
            .then((res) => {
              // 接收回调信息
              const data = res.data;
              if (data.success) {
                // 成功计数 并设置分片上传状态
                that.finishCount += 1;
                content.status = true;
              } else {
                // 失败计数
                that.errorCount += 1;
              }
              // 说明完成最后一个分片上传但上传期间出现错误
              if (
                that.errorCount !== 0 &&
                that.errorCount + that.finishCount === that.sliceCount
              ) {
                console.log("上传发生错误，请重传");
                that.showProgress = false;
                that.uploading = false;
              }
              // 说明还有分片未上传 需要继续递归
              if (that.finishCount + that.errorCount < that.sliceCount) {
                next();
              }
              // 说明所有分片上传成功了 发起合并操作
              if (that.finishCount === that.sliceCount) {
                this.merge();
              }
            })
            .catch((error) => {
              // 对于图中发生的错误需要捕获并记录
              that.errorCount += 1;
              if (
                that.errorCount !== 0 &&
                that.errorCount + that.finishCount === that.sliceCount
              ) {
                console.error("上传发生错误，请重传");
                that.showProgress = false;
                that.uploading = false;
              }
              // 当前分片上传失败不应影响下面的分片
              if (that.finishCount + that.errorCount < that.sliceCount) {
                next();
              }
              console.log(error);
            });
        };
        // next();
        while (that.sendCount < 10 && that.sendCount < that.sliceCount) {
          next();
        }
      });
    },
    sliceFile(file) {
      let that = this;
      // console.log("开始切片");
      that.fileChunkList = [];
      that.finishCount = 0;
      that.sliceCount = 0;
      that.errorCount = 0;
      that.showProcess = 0;
      return new Promise((resolve, reject) => {
        const spark = new SparkMD5.ArrayBuffer();
        // 用于读取文件计算 md5
        const fileReader = new FileReader();
        // 这里是依据.来对文件和类型进行分割
        let fileInfo = file.name.split(".");
        that.filename = fileInfo[0];
        // 最后一个.之前的内容都应该认定为文件名称
        if (fileInfo.length > 1) {
          that.filetype = fileInfo[fileInfo.length - 1];
          for (let i = 1; i < fileInfo.length - 1; i++) {
            that.filename = that.filename + "." + fileInfo[i];
          }
        }
        // 这里开始切片
        const chunkSize = 1024 * 1024 * 1;
        // 计算出切片数量
        that.sliceCount = Math.ceil(file.size / chunkSize);
        console.log("切片数量", file.size, that.sliceCount);
        let curChunk = 0;
        const sliceNext = () => {
          // 使用 slice 方法进行文件切片
          const chunkFile = file.raw.slice(curChunk, curChunk + chunkSize);
          // 读取当前切片文件流【这里会触发 onload 方法】
          fileReader.readAsArrayBuffer(chunkFile);
          // 加入切片列表
          that.fileChunkList.push({
            // 切片文件信息
            chunk: chunkFile,
            // 文件名
            filename: that.filename,
            // 分片索引 这里直接借助 sliceProgress 来实现
            seq: that.sliceProgress + 1,
            // 文件类型
            type: that.filetype,
            // 状态信息 用于标识是否上传成功
            status: false,
          });
          // 切片完成变量自增
          that.sliceProgress++;
        };
        sliceNext();
        // 读取文件流时会触发 onload 方法
        fileReader.onload = (e) => {
          // 将文件流加入计算 md5
          spark.append(e.target.result);
          // 修改切片位移
          curChunk += chunkSize;
          // 说明还没到达最后一个切片 继续切
          if (that.sliceProgress < that.sliceCount) {
            // console.log("继续切片");
            sliceNext();
          } else {
            that.finishSlice = true;
            that.hash = spark.end();
            console.log("文件分片完成");
            resolve();
            that.fileChunkList.forEach((content) => {
              content.hash = that.hash;
            });
          }
        };
      });
    },
    handleChange(file, fileList) {
      console.log(file, fileList);
      this.sliceFile(file);
    },
    merge() {
      // const merge = () => {
      let that = this;
      console.log("上传成功，等待服务器合并文件");
      // 发起合并请求 传入文件 hash 值、文件类型、文件名
      requestmerge({
        hash: that.hash,
        type: that.filetype,
        filename: that.filename,
        total: that.sliceCount,
      })
        .then((res) => {
          console.log("res", res);
          const data = res.data;
          if (data.success) {
            console.log(data.message);
            // 获取上传成功的文件地址
            console.log(data.content);
            // 其他业务操作...
          } else {
            console.error(data.message);
          }
          that.uploading = false;
        })
        .catch((e) => {
          console.error("发生错误了");
          that.uploading = false;
        });
      // };
    },
    test() {
      uploadslice({ aaa: 1 }).then((res) => {
        console.log(res);
      });
    },
  },
};
</script>

<style lang="scss" scoped></style>
