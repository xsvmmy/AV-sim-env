# RECENT: Simulation Application w/ Nash/Variance Voting
## How to Run

- Download SharedResponses.csv from Moral Machine dataset - https://osf.io/3hvt2/overview
- Run filter_responses.py with this csv
- Run ./start.sh to launch application

## Info: columns added by filter_responses.py script
- The script groups rows by ResponseID into pairs, then builds a fingerprint for each scenario — a signature of the exact character makeup + signal state +
  ped/passenger structure. It counts how many times across the entire dataset that same fingerprint appeared and how people voted each time.

n_stay: Count of all survey responses with this exact scenario fingerprint where the user chose stay
n_swerve: Same, but for swerve
n_total: n_stay + n_swerve (total responses for this fingerprint)
stay_prob: n_stay / n_total (fraction of people who chose stay)
swerve_prob: n_swerve / n_total (fraction who chose swerve)

### Logic Used:
utilitarian: intervention (swerve_prob)
deontological: non-interference (stay_prob)

### filter_respsones.py Run Guide
python filter_responses.py --limit N
N: number of scenarios to process; each scenario produces 2 rows (groups each ResponseID pair); i.e. running N=50 will produce 100 rows in the output csv
