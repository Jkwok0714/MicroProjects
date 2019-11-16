const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const db = require('../Objects/Database');
const { THUMB_PATH } = require('../constants');
const Tools = require('../Objects/Tools');

const fsp = {
    readdir: promisify(fs.readdir),
    access: promisify(fs.access)
};

const basePath = process.env.SCAN_PATH || './';
const AQUAS_PATH = '../public/aquas';

/**
 * @param {Request} req 
 * @param {Response} res 
 */
const handleRequest = async (req, res) => {
    const show = req.params.show;
    const username = req.query.user;
    const method = req.method;
    console.log('method', method)
    switch (method) {
        case 'DELETE':
            return await removeShow(show);
        case 'GET':
        default:
            return await scanLibrary(show, username ? decodeURIComponent(username) : null);
    }
};

/**
 * Remove a show directory by removing the files
 * @param {string} show 
 */
const removeShow = async (show) => {
    console.log(`[removeShow] Remove show called on ${show}`);
    const pathToShow = path.resolve(basePath, show);
    return { deleted: await Tools.removeDirectory(pathToShow)};
};

/**
 * Scan library. If no show is detected then just get root dir and their thumbnails
 * @param {string} show 
 * @param {string} username
 */
const scanLibrary = async (show, username) => {
    const usePath = show ? path.resolve(basePath, show) : basePath;
    let list = await fsp.readdir(usePath);

    list = !!show ? await buildSub(basePath, show, username) : await filterDirectories(usePath, list);
    
    return list;
};

/**
 * 
 * @param {string} basePath Root path to construct abs path from
 * @param {string[]} input List of files in the directory
 * @param {string} username
 */
const buildSub = async (basePath, show, username = null, initShowName = null) => {
    initShowName = initShowName || show;
    const showPath = path.resolve(basePath, show);
    const input = await fsp.readdir(showPath);
    let result = [];
    for (let i = 0; i < input.length; i++) {
        if (await isDirectory(path.resolve(showPath, input[i]))) {
            let dirContents = await buildSub(showPath, input[i], username, initShowName);
            result.push(...dirContents);
        } else {
            if (input[i].indexOf('mp4') === -1 && input[i].indexOf('m4v') === -1 && input[i].indexOf('webm') === -1) continue;
            if (input[i][0] === '.') continue;
            result.push({
                file: input[i],
                watched: username ? await checkWatched(username, `${initShowName}/${show}/${input[i]}`) : false,
                season: show,
                show: initShowName
            });
        }
    }
    return result;
};

const checkWatched = async (user, path) => {
    const sql = 'SELECT id FROM users_watched WHERE user_id=(SELECT id FROM users WHERE name = ?) AND path = ?';
    const rows = await db.get(sql, [user, path]);
    return !!rows;
};

const getThumbPath = async (name) => {
    const target = path.resolve(basePath, name, 'thumb.jpg');
    if (await checkAccess(target)) {
        return target;
    }

    const aquas = (await fsp.readdir(path.resolve(__dirname, AQUAS_PATH))).filter(f => f[0] !== '.');

    return path.resolve(__dirname, AQUAS_PATH, aquas[Math.floor(Math.random() * aquas.length)]);
};

const checkAccess = async (path) => {
    return new Promise(resolve => {
        fs.access(path, fs.constants.R_OK, err => {
            if (err) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

/**
 * Get only the dirs
 * @param {string[]} input 
 */
const filterDirectories = async (basePath, input) => {
    let result = [];
    for (let i = 0; i < input.length; i++) {
        if (await isDirectory(path.resolve(basePath, input[i])) && input[i][0] !== '.')
            result.push({
                filePath: input[i],
                thumb: input[i] + THUMB_PATH
            });
    }
    return result;
};

const isDirectory = (filePath) => {
    return new Promise((resolve, reject) => {
        fs.lstat(filePath, (err, stats) => {
            if (err) return reject(err);
            resolve(stats.isDirectory());
        });
    });
};

/**
 * 
 * @param {string} show 
 * @param {string} filename 
 * @param {Request} req
 * @param {Response} res 
 * 
 * https://stackoverflow.com/questions/24976123/streaming-a-video-file-to-an-html5-video-player-with-node-js-so-that-the-video-c
 */
const streamFile = (show, filename, req, res) => {
    let file = path.resolve(basePath, show, filename);
    const isFirefox = !!req.query.browser && req.query.browser === 'firefox';
    const isWebm = filename.indexOf('webm') !== - 1;
    console.log(`[streamFile] Access ${file}. Is Firefox? ${isFirefox}`);
    fs.stat(file, (err, stats) => {
        if (err) {
            console.error('[streamFile] error', err);
            if (err.code === 'ENOENT') {
                // 404 Error if file not found
                return res.sendStatus(404);
            }
            res.end(err);
        }
        var range = req.headers.range;
        if (!range) {
            console.error('[streamFile] missing range');
            // 416 Wrong range
            return res.sendStatus(416);
        }
        var positions = range.replace(/bytes=/, '').split('-');
        var start = parseInt(positions[0], 10);
        var total = stats.size;
        var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
        var chunksize = (end - start) + 1;

        res.writeHead(206, {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': isWebm ? 'video/webm' : 'video/mp4'
        });

        if (isFirefox && !isWebm) {
            /* We really don't wanna live transcode tho */
            let proc = ffmpeg({ source: file })
                .withVideoBitrate(2048)
                .outputOptions(['-movflags faststart', '-frag_size 4096', '-cpu-used 3', '-deadline realtime', '-threads 8'])
                .withVideoCodec('libvpx')
                .withAudioBitrate('128k')
                .withAudioCodec('vorbis')
                .toFormat('webm')
                .on('error', (err, stdout, stderr) => {
                    console.log(err, stderr);
                    res.end(err);
                })
                .stream()
                .pipe(res, { end: true });
        } else {
            let stream = fs.createReadStream(file, { start, end })
                .on('open', () => {
                    stream.pipe(res);
                }).on('error', err => {
                    console.error('[streamFile] Error streaming file', err);
                    res.end(err);
                });
        }
    });
};

module.exports = {
    handleRequest,
    getThumbPath,
    scanLibrary,
    streamFile
};