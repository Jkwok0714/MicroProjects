const loadResult = require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const {
    PORT
} = require('./constants');
const {
    getThumbPath,
    scanLibrary,
    streamFile
} = require('./Handlers/LibraryHandler');

if (loadResult.error) {
    Logger.error(`Error with loading config: ${loadResult.error.message ? loadResult.error.message : loadResult.error}`);
}

const staticPath = path.resolve(__dirname + '/public');

/* Configure Middleware */
app.use(express.static(staticPath));
app.all('*', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE');
    next();
});

app.use((req, res, next) => {
    console.log(`[index] ${req.method} to ${req.originalUrl}`);
    next();
});

app.get('/test', (req, res) => {
    res.send('こんにちは, 「ZA WARUDO」!');
});

app.get('/library/:show?', async (req, res) => {
    const show = req.params.show;
    const username = req.query.user;
    let data = await scanLibrary(show, username);
    res.status(200).send(data);
});

app.get('/player/:show/:filename', (req, res) => {
    const { filename, show } = req.params;
    streamFile(decodeURIComponent(show), decodeURIComponent(filename), req, res);
});

app.get('/thumb/:name', async (req, res) => {
    const name = req.params.name;
    res.status(200).sendFile(await getThumbPath(name));
});

app.post('/login/:name', (req, res) => {
    const name = req.params.name;
});

app.post('/watched/:name/:file', (req, res) => {
    const { file, name } = req.params;
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));
