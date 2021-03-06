/**
 * @fileOverview Push event is triggered when a repository branch is pushed to.
 * @author <a href="http://ruchevits.com/">Edward Ruchevits</a>
 * @version 1.0.0
 */

'use strict';

var Q = require('q');
var fs = require('fs-extra');
var glob = require("glob");
var del = require('del');
var mkdirp = require('mkdirp');

var config = require('../config');
var logger = require('../logger');
var helpers = require('../helpers');
var parsers = require('../parsers');
var database = require('../database');

/**
 * Routine to be executed whenever developer pushes to a watched repository.
 *
 * @param {object} payload - Project data.
 */
function pushEvent(payload){

    var project = {
        type: payload.type,
        slug: payload.slug,
        destination: payload.destination,
        repository: payload.repository
    };

    var temp = {};

    var startTime = new Date().getTime();

    return Q.fcall(function(){

        logger.info('New commit pushed to the ' + project.destination.type + ' ' + project.destination.name);

        // Create a temporary directory for project
        return helpers.directory.create.temp(config.temp + '/' + project.repository.name + '-' + Date.now());

    }).then(function(rootDir){

        logger.info("Created a temporary directory: " + rootDir);

        temp.paths = {
            root: rootDir
        };

        // Clone the repository into a temporary directory
        return helpers.repository.clone(project.repository.clone_url, temp.paths.root + '/repo');

    }).then(function(repoDir){

        logger.info("Cloned repository into: " + repoDir);

        temp.paths.repo = repoDir;

        // TODO: update glob pattern
        // Clean the repository directory from Git specific files
        return helpers.directory.clean(temp.paths.repo, []);

    }).then(function(deletedFilesNum){

        logger.info("Deleted " + deletedFilesNum + " Git specific files");

        // Read project configuration
        return helpers.filesystem.read.config(temp.paths.repo);

    }).then(function(projectConfig){

        logger.info("Parsed project config");

        // Read project summary from the config
        project.summary = projectConfig.summary;

        // Project configuration
        temp.parser = projectConfig.parser;
        temp.ignore = projectConfig.ignore;

        // Clean the repository directory from irrelevant files
        return helpers.directory.clean(temp.paths.repo, temp.ignore);

    }).then(function(deletedFilesNum){

        logger.info("Deleted " + deletedFilesNum + " irrelevant files");

        return parsers.run(temp.paths.root, temp.parser);

    }).then(function(compounds){

        logger.info("Parsed project sources using " + temp.parser + " parser");

        return database.createProjectAndCompounds(project, compounds);

    }).then(function(){

        logger.info("Saved project and its compounds to the database");

    }).catch(function(err){

        logger.error(err);

    }).done(function(){

        var elapsedTime = (new Date().getTime() - startTime) / 1000;

        logger.info("Push event finished successfully in " + elapsedTime + " seconds\n");

    });

}

module.exports = pushEvent;
