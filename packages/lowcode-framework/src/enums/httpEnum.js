/**
 * @description: 请求结果集
 */
export var ResultEnum;
(function (ResultEnum) {
    ResultEnum[ResultEnum["SUCCESS"] = 0] = "SUCCESS";
    ResultEnum[ResultEnum["ERROR"] = -1] = "ERROR";
    ResultEnum[ResultEnum["TIMEOUT"] = 10042] = "TIMEOUT";
    ResultEnum["TYPE"] = "success";
})(ResultEnum || (ResultEnum = {}));
/**
 * @description: 请求方法
 */
export var RequestEnum;
(function (RequestEnum) {
    RequestEnum["GET"] = "GET";
    RequestEnum["POST"] = "POST";
    RequestEnum["PATCH"] = "PATCH";
    RequestEnum["PUT"] = "PUT";
    RequestEnum["DELETE"] = "DELETE";
})(RequestEnum || (RequestEnum = {}));
/**
 * @description:  常用的contentTyp类型
 */
export var ContentTypeEnum;
(function (ContentTypeEnum) {
    // json
    ContentTypeEnum["JSON"] = "application/json;charset=UTF-8";
    // json
    ContentTypeEnum["TEXT"] = "text/plain;charset=UTF-8";
    // form-data 一般配合qs
    ContentTypeEnum["FORM_URLENCODED"] = "application/x-www-form-urlencoded;charset=UTF-8";
    // form-data  上传
    ContentTypeEnum["FORM_DATA"] = "multipart/form-data;charset=UTF-8";
})(ContentTypeEnum || (ContentTypeEnum = {}));
