public class DocumentModel
{
    public string Client { get; set; }
    public string Gender { get; set; }
    public string TypeOfDocument { get; set; }
    public string DocumentName { get; set; }
    public DateTime? DateReceivedOD { get; set; }
    public DateTime? DateRoutedPenro { get; set; }
    public DateTime? DateReleasedPenro { get; set; }
    public string Division { get; set; }
    public DateTime? DateReleased { get; set; }
    public string ReceivedBy { get; set; }
}


using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Data;

[ApiController]
[Route("api/documents")]
public class DocumentsController : ControllerBase
{
    private readonly IConfiguration _config;

    public DocumentsController(IConfiguration config)
    {
        _config = config;
    }

    [HttpPost("save")]
    public async Task<IActionResult> Save([FromBody] DocumentModel data)
    {
        using SqlConnection con = new SqlConnection(
            _config.GetConnectionString("AzureSql"));

        string sql = @"
            INSERT INTO Documents
            (Client, Gender, TypeOfDocument, DocumentName,
             DateReceivedOD, DateRoutedToPenro, DateReleasedPenro,
             Division, DateReleased, ReceivedBy)
            VALUES
            (@Client, @Gender, @TypeOfDocument, @DocumentName,
             @DateReceivedOD, @DateRoutedToPenro, @DateReleasedPenro,
             @Division, @DateReleased, @ReceivedBy)";

        using SqlCommand cmd = new SqlCommand(sql, con);
        cmd.Parameters.AddWithValue("@Client", data.Client);
        cmd.Parameters.AddWithValue("@Gender", data.Gender);
        cmd.Parameters.AddWithValue("@TypeOfDocument", data.TypeOfDocument);
        cmd.Parameters.AddWithValue("@DocumentName", data.DocumentName);
        cmd.Parameters.AddWithValue("@DateReceivedOD", (object?)data.DateReceivedOD ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@DateRoutedToPenro", (object?)data.DateRoutedPenro ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@DateReleasedPenro", (object?)data.DateReleasedPenro ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@Division", data.Division);
        cmd.Parameters.AddWithValue("@DateReleased", (object?)data.DateReleased ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@ReceivedBy", data.ReceivedBy);

        await con.OpenAsync();
        await cmd.ExecuteNonQueryAsync();

        return Ok(new { success = true });
    }
}