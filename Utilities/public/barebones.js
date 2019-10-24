const submitYtDl = async () => {
    const url = $('#url-field').val();
    const format = $('#format-field').val();
    const data = {
        link: url,
        options: !!format ? {
            formatID: format
        } : undefined
    };
    const res = await postRequest('download', data);
    printMessage(res);
};

const submitRename = async () => {
    const origin = $('#rename-field').val();
    const checked = $('#execute-check').prop('checked');
    const data = {
        path: origin && origin.length > 1 ? origin : null,
        execute: checked
    };
    $('#execute-check').prop('checked', false);
    const res = await postRequest('rename', data);
    if (Array.isArray(res)) {
        const starter = '<p>Please confirm:</p>';
        printMessage(starter + res.map(item => `<div class="microlist-item">${item.name} ↣ ${item.newName}</div>`).join(''));
    } else {
        printMessage(res);
    }
};

const submitMigrate = async () => {
    const origin = $('#path1-field').val();
    const destination = $('#path2-field').val();
    const data = {
        origin: origin && origin.length > 1 ? origin : null,
        destination: destination && destination.length > 1 ? destination : null
    };
    const res = await postRequest('migrate', data);
    printMessage(res);
};

const toggleLoader = (state) => {
    $('.loader').toggleClass('hidden', state);
};

const printMessage = (message) => {
    $('.console').append(`<li>${typeof message === 'string' ? message : JSON.stringify(message)}</li>`);
};

const checkClipboard = async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            $('#url-field').val(text);
        }
    } catch (e) {}
};

const postRequest = async (url, params) => {
    return new Promise(async resolve => {
        const options = {
            // headers: {
            //     'content-type': 'application/json; charset=UTF-8'
            // },
            body: params,
            method: 'post'
        };

        const res = await fetch(url, options);
        const text = await res.text();
        try {
            resolve(JSON.parse(text));
        } catch (e) {
            resolve(text);
        }
    });
};

const main = () => {
    
};

// window.addEventListener('focus', () => {
//     checkClipboard();
// });

$(document).ready(main);