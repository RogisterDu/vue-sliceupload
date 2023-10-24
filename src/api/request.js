import axios from 'axios'
const qs = require('qs')

axios.defaults.baseURL = 'http://localhost:8080/api/'
axios.defaults.timeout = 40 * 1000
// axios.defaults.headers.post['Content-Type'] = 'application/json'

axios.interceptors.request.use(
	config => {
		config.headers['Content-Type'] = 'application/json'
		return config
	},
	error => {
		return Promise.reject(error)
	}
)

/**
 * get方法，对应get请求
 * @param {String} url [请求的url地址]
 * @param {Object} params [请求时携带的参数]
 */
export function get(url, params) {
	return new Promise((resolve, reject) => {
		axios
			.get(url, {
				params
			})
			.then(res => {
				resolve(res)
			})
			.catch(err => {
				reject(err)
			})
	})
}

/**
 * post方法，对应post请求
 * @param {String} url [请求的url地址]
 * @param {Object} params [请求时携带的参数]
 */
export function post(url, params) {
	return new Promise((resolve, reject) => {
		axios
			.post(url, params)
			.then(res => {
				resolve(res)
			})
			.catch(err => {
				reject(err)
			})
	})
}