import util from "node:util";

/**
 *
 * @param {*} object
 * @param {import('node:util').InspectOptions|null} options
 * @returns {void}
 */
export default function debug(object, options = {}) {
	const debug = util.inspect(object, {
		showHidden: false,
		colors: true,
		depth: 2,
		...options,
	});

	console.log(debug);
}
