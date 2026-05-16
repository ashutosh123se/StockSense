import torch
import torch.nn as nn

class StockGRU(nn.Module):
    """
    Lighter GRU with residual connections for faster inference.
    """
    def __init__(self, input_size=47, hidden_size1=128, hidden_size2=64, num_classes=3):
        super(StockGRU, self).__init__()
        
        self.gru1 = nn.GRU(input_size, hidden_size1, batch_first=True, bidirectional=True, dropout=0.15, num_layers=1)
        self.gru2 = nn.GRU(hidden_size1 * 2, hidden_size2, batch_first=True, bidirectional=True, dropout=0.15, num_layers=1)
        
        self.input_proj = nn.Linear(input_size, hidden_size2 * 2)
        
        self.fc = nn.Linear(hidden_size2 * 2, 64)
        self.gelu = nn.GELU()
        self.dropout = nn.Dropout(0.25)
        self.out = nn.Linear(64, num_classes)
        
    def forward(self, x):
        # x shape: [batch, seq_len, features]
        # input projection for residual
        residual = self.input_proj(x)
        residual_pool = residual.mean(dim=1)
        
        out, _ = self.gru1(x)
        out, _ = self.gru2(out)
        
        # Global average pooling
        pool = out.mean(dim=1)
        
        # Skip connection
        x = pool + residual_pool
        
        x = self.fc(x)
        x = self.gelu(x)
        x = self.dropout(x)
        
        logits = self.out(x)
        return logits
