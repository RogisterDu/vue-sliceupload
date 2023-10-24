import { post } from './request'
export function uploadslice(data, params) {
    const { hash, filename, seq, type } = params
    return post('test/upload?hash=' + hash + '&filename=' + filename + '&seq=' + seq + '&type=' + type, data)
}
export function requestmerge(data) {
    return post('test/merge', data)
}