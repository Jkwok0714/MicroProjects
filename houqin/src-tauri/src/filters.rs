#[derive(Debug, Clone)]
pub struct ExcludeMatcher {
    values: Vec<String>,
}

impl ExcludeMatcher {
    pub fn new(values: &[String]) -> Self {
        Self {
            values: values
                .iter()
                .map(|value| value.trim().to_ascii_lowercase())
                .filter(|value| !value.is_empty())
                .collect(),
        }
    }

    pub fn is_excluded_dir(&self, name: &str) -> bool {
        let lowered = name.trim().to_ascii_lowercase();
        self.values.iter().any(|value| value == &lowered)
    }
}
