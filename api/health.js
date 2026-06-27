module.exports = (_request, response) => {
  response.status(200).json({
    success: true,
    service: "Joy Corner Firebase + Google Sheets API",
  });
};
