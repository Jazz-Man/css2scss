import util from "node:util";

/**
 *
 * @param {*} object
 * @param {import('node:util').InspectOptions|null} options
 * @returns {void}
 */
export default function debug(object, options = {}) {
	const debug = util.inspect(object, {
		colors: true,
		depth: 2,
		showHidden: false,
		...options,
	});

	console.log(debug);
}
