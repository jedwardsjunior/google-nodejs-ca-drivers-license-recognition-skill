'use strict';

/**
 * @author - jedwards
 * @date - September 2017
 */

// Constants required for analyzing the drivers license
const IDENTITY_DOCUMENT_LABEL = 'identity document';

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
 * exports.getMetadataValueForDriversLicense()
 *
 * Helper function to extract the text found by the Google Cloud Vision API to the corresponding CA Driver's License field.
 *
 * Input:
 * (JSON) annotationImageResponse - the classifications found by the Cloud Vision API in JSON format
 *
 * Output:
 * (JSON) - the formatted metadata for the CA Driver's License
 */
exports.getMetadataValueForDriversLicense = (annotationImageResponse) => {
	console.log(annotationImageResponse);

	var driversLicenseMetadata = {};

	// If this is not an identity document, the "identity document" label will not be returned as part of the
	// labelAnnotations response
	var isIdentityDocument = false;
	if (annotationImageResponse.hasOwnProperty('labelAnnotations')) {
		annotation = annotationImageResponse['labelAnnotations'];
		if (annotation.length > 0) {
			for (var i = 0; i < annotation.length - 1; i++) {
				if (annotation[i].description == IDENTITY_DOCUMENT_LABEL) {
					isIdentityDocument = true;
					break;
				}
			}
		}
	}

	if (!isIdentityDocument) {
		return driversLicenseMetadata;
	}

	// This is an identity document, so parse the text that Google Cloud Vision found
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
