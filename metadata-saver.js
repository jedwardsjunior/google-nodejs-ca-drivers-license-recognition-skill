'use strict';

/**
 * @author - jedwards
 * @date - September 2017
 */

/**
 * exports.saveMetadata()
 *
 * Helper function to save the metadata back to the file on Box.
 *
 * Inputs:
 * (Object) client - the Box API client that we will use to read in the file contents
 * (int) fileID - the ID of the image file to classify
 * (string) metadataValue - the formatted metadata to save back to Box
 * (function) callback - the function to call back to once finished
 *
 * Output:
 * (void)
 */
exports.saveMetadata = (client, fileID, metadata, templateKey, callback) => {
	if (Object.keys(metadata).length === 0) {
		var response = {
			statusCode: 200,
			body: metadata
		}
		callback(null, response);

	} else {
		client.files.addMetadata(fileID, 'enterprise', templateKey, metadata, (error, result) => {
			if (error) {
				console.log(error);
				callback(error);
			} else {
				var response = {
					statusCode: 200,
					body: metadata
				}

				callback(null, response);
			}
		})
	}
}
