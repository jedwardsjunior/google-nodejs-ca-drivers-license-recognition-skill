'use strict';

/**
 * @author - jedwards
 * @date - September 2017
 */

// Load the required NPM modules
const BoxSDK = require('box-node-sdk');
const GoogleCloudVision = require('@google-cloud/vision');
const Unescape = require('unescape-js');

// An array of all the features we're requesting Google Cloud Vision to return
const features = [
	{
		type: GoogleCloudVision.v1.types.Feature.Type.DOCUMENT_TEXT_DETECTION
	},
]

// Set up access to the Google Cloud Vision API
const google_cloud_vision = new GoogleCloudVision({
	projectId: process.env.GCV_PROJECT_ID,
	credentials: {
		client_email: process.env.GCV_CLIENT_EMAIL,
		private_key: Unescape(process.env.GCV_PRIVATE_KEY)
	}
});

// Super basic/specific text matching patterns (start, offset, stop/length) to fill in the CA Driver's License metadata fields
const driversLicenseFields = {
	'idNumber' : {
		'start': 'LICENSE',
		'offset': 11,
		'numChars': 8
	},
	'firstName': {
		'start': 'FN',
		'offset': 3,
		'stop': '\n'
	},
	'lastName': {
		'start': 'LN',
		'offset': 3,
		'stop': 'FN'
	},
	'address': {
		'start': 'FN',
		'offset': 3,
		'stop': 'DOB'
	},
	'gender': {
		'start': 'SEX',
		'offset': 4,
		'numChars': 1
	},
	'dateOfBirth': {
		'start': 'DOB',
		'offset': 4,
		'numChars': 10
	},
	'issuingDate': {
		'start': 'ISSEE\nDD',
		'offset': 31,
		'numChars': 10
	},
	'expirationDate': {
		'start': 'EXP',
		'offset': 4,
		'numChars': 10
	}
}

/**
 * exports.handler()
 *
 * This is the main function that the Lamba will call when invoked.
 *
 * Inputs:
 * (JSON) event - data from the event, including the payload of the webhook, that triggered this function call
 * (JSON) context - additional context information from the request (unused in this example)
 * (function) callback - the function to call back to once finished
 *
 * Outputs:
 * (void)
 */
exports.handler = (event, context, callback) => {
	var sdk = new BoxSDK({
		clientID: process.env.BOX_CLIENT_ID,
		clientSecret: process.env.BOX_CLIENT_SECRET,
		appAuth: {
			keyID: process.env.BOX_KEY_ID,
			privateKey: Unescape(process.env.BOX_PRIVATE_KEY),
			passphrase: process.env.BOX_PASSPHRASE
		},
	});

	var webhookData = JSON.parse(event.body);
	var userID = webhookData.source.owned_by.id;
	var fileID = webhookData.source.id;

	var client = sdk.getAppAuthClient('user', userID);
	getAnnotations(client, fileID, (error, annotationImageResponse) => {
	 	saveMetadata(client, fileID, getMetadataValueForDriversLicense(annotationImageResponse), 'caDriversLicenseBoxworksDemo', callback);
    });
};

/**
 * getAnnotations()
 *
 * Helper function to pass the contents of the image file to the Google Cloud Vision API to grab the annotations that
 * can be found on the image.
 *
 * Inputs:
 * (Object) client - the Box API client that we will use to read in the file contents
 * (int) fileID - the ID of the image file to classify
 * (function) callback - the function to call back to once finished
 *
 * Output:
 * (void)
 */
const getAnnotations = (client, fileID, callback) => {
	client.files.getReadStream(fileID, null, (error, stream) => {
		if (error) {
			console.log(error);
			callback(error);
		}

		var buffer = new Buffer('', 'base64');
	    stream.on('data', (chunk) => {
	        buffer = Buffer.concat([buffer, chunk]);
	    });

	    stream.on('end', () => {
			var request = {
				image: { content : buffer },
				features: features
			};

			google_cloud_vision.annotateImage(request)
			.then(function(responses) {
				var annotationImageResponse = JSON.parse(JSON.stringify(responses[0]));
				callback(null, annotationImageResponse);
			})
			.catch(function(error) {
				console.log(error);
			});
		});
	});
}

/**
 * saveMetadata()
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
const saveMetadata = (client, fileID, metadata, templateKey, callback) => {
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

/**
 * getMetadataValueForDriversLicense()
 *
 * Helper function to extract the text found by the Google Cloud Vision API to the corresponding CA Driver's License field.
 *
 * Input:
 * (JSON) annotationImageResponse - the classifications found by the Cloud Vision API in JSON format
 *
 * Output:
 * (JSON) - the formatted metadata for the CA Driver's License
 */
const getMetadataValueForDriversLicense = (annotationImageResponse) => {
	var driversLicenseMetadata = {};

	if (annotationImageResponse.hasOwnProperty('fullTextAnnotation')) {
		var annotation = annotationImageResponse['fullTextAnnotation'];

		if (annotation && annotation.hasOwnProperty('text')) {
			var text = annotation.text;
			var info = '';
			for (var key in driversLicenseFields) {
				var field = driversLicenseFields[key];
				var start = text.indexOf(field['start']) + field['offset'];

				// For the address, there's no good text to signal the beginning
				// of the field. Instead we can add the length of the first name
				// as an additional offset (since they are side-by-side)
				if (key === 'address') {
					start += driversLicenseMetadata['firstName'].length
				}

				var end = -1;
				if (start > -1) {
					if (field['stop']) {
						// Stop at the occurrence of the "stop" string that first appears
						// after the "start" string
						end = text.indexOf(field['stop'], start);
					} else {
						// This field has a fixed number of characters
						end = start + field['numChars'];
					}

					info = text.substring(start, end);
					info = info.replace(new RegExp('/', 'g'), '-');
				}

				driversLicenseMetadata[key] = info;
				info = '';
			}
		}
	}

	return driversLicenseMetadata;
}
