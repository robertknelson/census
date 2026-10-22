using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Threading;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Evaluation
{
    public class FeatureGateScanLogger : BackgroundService
    {
        private readonly FeatureGateScanner _scanner;
        private readonly ILogger<FeatureGateScanLogger> _logger;

        public FeatureGateScanLogger(FeatureGateScanner scanner, ILogger<FeatureGateScanLogger> logger)
        {
            _scanner = scanner;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                var report = await _scanner.ScanAsync();
                foreach (var reference in report.Undefined)
                {
                    _logger.LogWarning(
                        "FeatureGate references undefined feature '{Feature}' (always off) at {Locations}.",
                        reference.Feature, string.Join("; ", reference.Locations));
                }
            }
            catch (SqlException ex)
            {
                _logger.LogError(ex, "Feature gate scan could not read feature definitions.");
            }
        }
    }
}
