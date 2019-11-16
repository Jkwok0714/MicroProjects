import { Component } from 'preact';
import { route } from 'preact-router';
import axios from 'axios';
import Card from 'preact-material-components/Card';
import Button from 'preact-material-components/Button';
import List from 'preact-material-components/List';
import 'preact-material-components/Card/style.css';
import 'preact-material-components/Button/style.css';
import 'preact-material-components/List/style.css';
import style from './style';

import ConfirmationDialog from '../../components/confirmationDialog';
import Viewer from '../../components/viewer';
import { SERVER } from '../../helpers/constants';
import { isFirefox, isMP4 } from '../../helpers/helpers';

/**
 * @typedef Episode
 * @property {string} file
 * @property {string} season
 * @property {string} show
 * @property {string} [watched=]
 */
export default class Show extends Component {
    state = {
        episodes: {},
        viewerOpen: false,
        selectedFile: null,
        showWarning: null,
        dialogShowing: null
    };

    componentWillMount () {
        this.getEpisodes();
    }

    setDialogShowing = (text, onConfirm, onReject) => {
        if (!text && !onConfirm && !onReject) return this.setState({ dialogShowing: null });
        this.setState({ dialogShowing: { text, onConfirm, onReject }});
    };

    getEpisodes = () => {
        const query = this.props.user ? `?user=${encodeURIComponent(this.props.user)}` : '';
        axios.get(`${SERVER}/library/${this.props.show}${query}`).then(res => {
            // console.log(res.data)
            if (isFirefox()) this.detectMp4(res.data);
            this.setState({ episodes: this.processSeasons(res.data) });
        }).catch(err => console.log(err));
    }

    /**
     * @param {Episode[]} data
     */
    detectMp4 = (data) => {
        for (let i = 0; i < data.length; i++) {
            if (isMP4(data[i].file)) {
                this.setState({ showWarning: 'These files are mp4s which are not supported by Firefox. The server will live transcode to webm, so seeking will be disabled and more time is needed to buffer.' });
                return true;
            }
        }
        return false;
    };

    /**
     * @param {Episode[]} data 
     */
    processSeasons (data) {
        return data.reduce((acc, item) => ((acc[item['season']] = [...(acc[item['season']] || []), item]), acc), {});
    }

    /**
     * @param {Episode} selectedFile
     */
    launchViewer = (selectedFile) => {
        selectedFile = selectedFile.season === this.props.show ? selectedFile.file : `${selectedFile.season}/${selectedFile.file}`;
        this.setState({
            selectedFile,
            viewerOpen: true
        })
    }

    closeViewer = () => {
        this.setState({
            selectedFile: null,
            viewerOpen: false
        });
        this.getEpisodes();
    }

    clearWarning = () => {
        this.setState({ showWarning: null });
    }

    handleUploadToShow = () => {
        route(`/upload?show=${encodeURIComponent(this.props.show)}`);
    }

    handleDeleteShow = () => {
        this.setDialogShowing('Are you sure you want to delete this show?', this.onDeleteShow, () => {
            this.setDialogShowing(null);
        });
    }

    onDeleteShow = () => {
        (async () => {
            await axios.delete(`${SERVER}/library/${this.props.show}`);
            route('/');
        })();
    }

    render({ show }) {
        const { episodes, viewerOpen, selectedFile, showWarning, dialogShowing } = this.state;
        return (
            <div class={`${style.home} page`}>
                {dialogShowing && (
                    <ConfirmationDialog
                        text={dialogShowing.text}
                        onConfirm={dialogShowing.onConfirm}
                        onReject={dialogShowing.onReject}
                    />
                )}
                <header class={style.headerTitle}>
                    <img src={`${SERVER}/thumb/${show}`} class={style.showImage} />
                    <h1 class={style.titleText}>{show}</h1>
                    <section class={style.actionBar}>
                        <span class={style.action} onClick={this.handleUploadToShow}>Upload to Show</span>
                        <span class={style.action} onClick={this.handleDeleteShow}>Delete Show</span>
                    </section>
                </header>
                <section class={style.episodeList}>
                    {showWarning &&
                        <Card class={style.warningCard}>
                            <p>{showWarning}</p>
                            <Button raised ripple class={style.cardButton} onClick={this.clearWarning}>Dismiss</Button>
                        </Card>
                    }
                    {Object.keys(episodes).map(seasonSet => (
                        <div class={style.seasonSet}>
                            <h2>{seasonSet !== show ? seasonSet : 'No Season'}</h2>
                            {episodes[seasonSet].map(episode => (
                                <div class={style.episode} onClick={() => this.launchViewer(episode)}>
                                    {episode.file} {episode.watched && <List.ItemGraphic class={style.watched}>check_circle_outline</List.ItemGraphic>}
                                </div>
                            ))}
                        </div>
                    ))}
                </section>

                {viewerOpen && (
                    <Viewer
                        show={show}
                        filename={selectedFile}
                        onClose={this.closeViewer}
                        user={this.props.user}
                    />
                )}
            </div>
        );
    }
}
