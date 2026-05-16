import torch
import torch.nn as nn

class StockLSTM(nn.Module):
    """
    Stacked bidirectional LSTM for sequence-to-one directional prediction.
    """
    def __init__(self, input_size=47, hidden_size1=256, hidden_size2=128, num_classes=3):
        super(StockLSTM, self).__init__()
        self.lstm1 = nn.LSTM(input_size, hidden_size1, batch_first=True, bidirectional=True, dropout=0.2, num_layers=1)
        self.lstm2 = nn.LSTM(hidden_size1 * 2, hidden_size2, batch_first=True, bidirectional=True, dropout=0.2, num_layers=1)
        
        self.attn = nn.MultiheadAttention(embed_dim=hidden_size2 * 2, num_heads=4, batch_first=True)
        
        self.fc1 = nn.Linear(hidden_size2 * 2, 128)
        self.ln1 = nn.LayerNorm(128)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        
        self.fc2 = nn.Linear(128, 64)
        self.out = nn.Linear(64, num_classes)
        
    def forward(self, x):
        # x shape: [batch, seq_len, features]
        out, _ = self.lstm1(x)
        out, _ = self.lstm2(out)
        
        # Self-attention
        attn_out, _ = self.attn(out, out, out)
        
        # Context vector from last time step
        context = attn_out[:, -1, :]
        
        x = self.fc1(context)
        x = self.ln1(x)
        x = self.relu(x)
        x = self.dropout(x)
        
        x = self.fc2(x)
        x = self.relu(x)
        
        logits = self.out(x)
        return logits
